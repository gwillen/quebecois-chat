import sys
import logging
import os
import json
import gevent
import time
import datetime
import random

from gevent import monkey, Timeout

monkey.patch_all()

from functools import wraps
from urlparse import urlparse
from flask import Flask, request, make_response, Response

import pymongo
import pika
import zulip

import json
from bson.objectid import ObjectId
from bson.timestamp import Timestamp
class MyEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, ObjectId):
            return str(o)
        elif isinstance(o, Timestamp):
            return str(o)
        else:
            return json.JSONEncoder.default(self, o)

def rand_id(bits):
    result = ""
    for i in range(0, bits / 4):
        result += random.choice("0123456789abcdef")
    return result

# XXX should have some handling of presence/idle, bidirectional heartbeats

# XXX
logging.basicConfig(filename='quebecois.proxy.log', level=logging.DEBUG)

MAGIC_KEY = 'fhqwhgads'
MONGO_URL = os.environ.get('MONGOHQ_URL')
TX_QUEUE_URL = os.environ.get('RABBITMQ_BIGWIG_TX_URL')
RX_QUEUE_URL = os.environ.get('RABBITMQ_BIGWIG_RX_URL')
QUEUE_EXCHANGE = 'test'

if MONGO_URL:
    mongo_conn = pymongo.Connection(MONGO_URL)
    db = mongo_conn[urlparse(MONGO_URL).path[1:]]
else:
    # Not on an app with the MongoHQ add-on, do some localhost action
    mongo_conn = pymongo.Connection('localhost', 27017)
    db = mongo_conn['someapps-db']

# Default of 0.25 seconds is too quick for my taste; give it 5 seconds.
pika.adapters.BlockingConnection.SOCKET_CONNECT_TIMEOUT = 5

if TX_QUEUE_URL and RX_QUEUE_URL:
    pika_tx_params = pika.URLParameters(TX_QUEUE_URL + "?socket_timeout=5&retry_delay=1&connection_attempts=3")
    pika_rx_params = pika.URLParameters(RX_QUEUE_URL + "?socket_timeout=5&retry_delay=1&connection_attempts=3")
else:
    pika_tx_params = pika.ConnectionParameters(host='localhost')
    pika_rx_params = pika.ConnectionParameters(host='localhost')

setup_conn = pika.BlockingConnection(pika_tx_params)
setup_channel = setup_conn.channel()
setup_channel.exchange_declare(exchange=QUEUE_EXCHANGE, type='topic') #XXX, durable=True)
setup_conn.close()

logging.basicConfig(filename='error.log',level=logging.DEBUG)

app = Flask(__name__)
app.config.from_pyfile('config.py')
client = zulip.Client(email="quebecois-bot@rotq.net",
    api_key="BfsqBUyxSfMzmKyguETDS3xbG7eNbRGv")

def add_response_headers(headers={}):
    """This decorator adds the headers passed in to the response"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            resp = make_response(f(*args, **kwargs))
            h = resp.headers
            for header, value in headers.items():
                h[header] = value
            return resp
        return decorated_function
    return decorator

def require_key():
    """This decorator requires the magic key to access the route"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if request.args.get('key') != MAGIC_KEY:
                return '{"result": "error", "msg": "bad quebecois key"}'
            else:
                return f(*args, **kwargs)
        return decorated_function
    return decorator

@app.route('/asdf', methods=["OPTIONS"])
@add_response_headers({'Access-Control-Allow-Origin': '*'})
@add_response_headers({'Access-Control-Allow-Headers': 'X-Requested-With'})
def asdf_options():
    return ''

@app.route('/asdf', methods=["GET"])
@require_key()
@add_response_headers({'Access-Control-Allow-Origin': '*'})
@add_response_headers({'Access-Control-Allow-Headers': 'X-Requested-With'})
def asdf():
    #db.test_collection.insert({"testdoc":[123, 456, {"789": "hiyooo"}]})
    db.test_collection.update({"testdoc":"totaltest"}, {"$push": {"values": str(time.time())}})
    return json.dumps(list(db.test_collection.find()), cls=MyEncoder)

@app.route('/subscribe', methods=["OPTIONS"])
@add_response_headers({'Access-Control-Allow-Origin': '*'})
@add_response_headers({'Access-Control-Allow-Headers': 'X-Requested-With'})
def subscribe_options():
    return ''

@app.route('/subscribe', methods=["GET"])
@require_key()
@add_response_headers({'Access-Control-Allow-Origin': '*'})
@add_response_headers({'Access-Control-Allow-Headers': 'X-Requested-With'})
def subscribe():
    try:
        rx_conn = pika.BlockingConnection(pika_rx_params)
        recv_channel = rx_conn.channel()

        channel_token = request.args.get('channel_token')
        target = request.args.get('target')
        queue_name = "channel_token_" + channel_token
        # XXX is there a way to get confirms/return values on these pika calls?
        recv_queue = recv_channel.queue_declare(
            queue=queue_name,
            # Expire the queue after 5 minutes of disuse. (That means no calls to /subscribe or /events.)
            arguments={"x-expires": 1000 * 60 * 5})
        recv_channel.queue_bind(
            exchange=QUEUE_EXCHANGE,
            queue=queue_name,
            routing_key=target)

        rx_conn.close()

        # XXX note that if our routing key contains # or * wildcards, they will apply in 
        #   getting fresh messages, but not in getting SB unless we do that ourselves. Also,
        #   the sub entry in the db is gonna get leaked unless we make it expire with a TTL,
        #   in which case we have to refresh it periodically to keep it alive (and keep it
        #   in sync with the expiry on the queue or maybe get in trouble?)
        result = db.subscriptions.update(
            {"channel_token": channel_token},
            {"$addToSet": {"targets": target}},
            upsert=True,
            w=1)  # This enables write acknowledgement which means we get a result object.
        return json.dumps({"result": "ok", "mongo": result}, cls=MyEncoder)
    except Exception as e:
        return json.dumps({"result": "error", "error": str(e)}, cls=MyEncoder)

@app.route('/channels', methods=["OPTIONS"])
@add_response_headers({'Access-Control-Allow-Origin': '*'})
@add_response_headers({'Access-Control-Allow-Headers': 'X-Requested-With'})
def channels_options():
    return ''

@app.route('/channels', methods=["GET"])
@require_key()
@add_response_headers({'Access-Control-Allow-Origin': '*'})
@add_response_headers({'Access-Control-Allow-Headers': 'X-Requested-With'})
def channels():
    channels = list(db.channels.find({}, {"name": 1, "_id": 0}))
    channels = map(lambda x: x["name"], channels)
    return json.dumps(channels, cls=MyEncoder)

@app.route('/event_history', methods=["OPTIONS"])
@add_response_headers({'Access-Control-Allow-Origin': '*'})
@add_response_headers({'Access-Control-Allow-Headers': 'X-Requested-With'})
def event_history_options():
    return ''

# XXX a good client needs to dedupe between the final history entries and the first /events entries based on the id field.
# (how does this interact with the possibility that we may have multiple channels? Could we have dupes interspersed with non-dupes?)
@app.route('/event_history', methods=["GET"])
@require_key()
@add_response_headers({'Access-Control-Allow-Origin': '*'})
@add_response_headers({'Access-Control-Allow-Headers': 'X-Requested-With'})
def event_history():
    channel_token = request.args.get('channel_token')
    subscriptions = list(db.subscriptions.find({"channel_token": channel_token}, {"targets": 1, "_id": 0}))
    if len(subscriptions) != 1:
        return json.dumps({"result": "error", "error": "bad subscriptions list: " + str(subscriptions)});
    targets = subscriptions[0]["targets"]
    history_chans = list(db.channels.find({"name": {"$in": targets}}))

    history = []
    for channel in history_chans:
        for message in channel["messages"]:
            message["to"] = {"channel": channel["name"]}
            history.append(message)
    history.sort(key=lambda message: message.get("timestamp", -1))  # XXX some of our timestamps are missing

    return json.dumps(list(history), cls=MyEncoder)

@app.route('/events', methods=["OPTIONS"])
@add_response_headers({'Access-Control-Allow-Origin': '*'})
@add_response_headers({'Access-Control-Allow-Headers': 'X-Requested-With'})
def events_options():
    return ''

@app.route('/events', methods=["GET"])
@require_key()
@add_response_headers({'Access-Control-Allow-Origin': '*'})
@add_response_headers({'Access-Control-Allow-Headers': 'X-Requested-With'})
def events():
    channel_token = request.args.get('channel_token')
    queue_name = "channel_token_" + channel_token
    logging.debug("Listening on queue %s", queue_name)

    def generate():
        body = None
        rx_conn = None
        recv_channel = None

        try:
            yield ' ' * 4096  # Force old Chrome to flush things and populate xhr.responseText
            logging.debug("Opening BlockingConnection with params %s (%s)", str(pika_rx_params), datetime.datetime.now().strftime("%I:%M:%S"))
            rx_conn = pika.BlockingConnection(pika_rx_params)
            logging.debug("Connection open, getting channel (%s)", datetime.datetime.now().strftime("%I:%M:%S"))
            recv_channel = rx_conn.channel()
            logging.debug("Channel is open")

            while body is None:
                # Reassure the middleware periodically so it doesn't time out on us, and give the client a heartbeat to know we're still here.
                yield ' '
                with Timeout(5, False):
                    (method, properties, body) = next(recv_channel.consume(queue_name))
            # Got something!
            recv_channel.basic_ack(method.delivery_tag)
            logging.debug("... got body %s", body)
            # XXX zulip API could return multiple events, we only get one... simulate the zulip API
            yield json.dumps({"result": "ok", "events": [{"message": json.loads(body)}]})
        except pika.exceptions.ChannelClosed as e:
            logging.error("getting events failed with ChannelClosed: %s", e)
            result = "error"
            if e.args[0] == 404:
                # Our queue expired; give up and start over.
                logging.error("Fatal, queue seems gone; starting over")
                result = "fatal"
            yield json.dumps({"result": result, "error": str(e)}, cls=MyEncoder)
        except Exception as e:
            logging.error("getting events failed: %s (exception's type is %s) (%s)", e, str(type(e)), datetime.datetime.now().strftime("%I:%M:%S"))
            yield json.dumps({"result": "error", "error": str(e)}, cls=MyEncoder)
        finally:
            if recv_channel is not None:
                recv_channel.cancel()
            if rx_conn is not None:
                rx_conn.close()

    return Response(generate())

@app.route('/send', methods=["OPTIONS"])
@add_response_headers({'Access-Control-Allow-Origin': '*'})
@add_response_headers({'Access-Control-Allow-Headers': 'X-Requested-With'})
def send_options():
    return ''

@app.route('/send', methods=["POST"])
@require_key()
@add_response_headers({'Access-Control-Allow-Origin': '*'})
@add_response_headers({'Access-Control-Allow-Headers': 'X-Requested-With'})
def send():
    try:
        tx_conn = pika.BlockingConnection(pika_tx_params)
        send_channel = tx_conn.channel()

        target = request.args.get('target')
        sender = request.args.get('sender')
        content = request.form.get('content')

        message = {
            "id": rand_id(128),
            "from": {"user": sender},
            "timestamp": time.time(),
            "content": content }

        logging.debug("sending with routing key %s", target)
        try:
            send_channel.basic_publish(exchange=QUEUE_EXCHANGE,
                routing_key=target,
                body=json.dumps(message, cls=MyEncoder))
            logging.debug("sent %s message %s", target, json.dumps(message, cls=MyEncoder))
        except Exception as e:
            logging.error("failed to publish: %s", str(e))
            return json.dumps({"result": "error", "error": str(e)}, cls=MyEncoder)
        finally:
            tx_conn.close()

        mongo_result = db.channels.update(
            {"name": target},
            {"$push": {"messages": message}},
            upsert=True,
            w=1)  # This enables write acknowledgement which means we get a result object.
        return json.dumps({"result": "ok", "mongo": mongo_result}, cls=MyEncoder)
    except Exception as e:
        return json.dumps({"result": "error", "error": str(e)})

# If we're run directly and not through gunicorn
if __name__ == '__main__':
    app.config['DEBUG'] = True
    app.run()
