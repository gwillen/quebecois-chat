import sys
import logging
import os
import zulip
import json
import gevent
import pymongo
import pika

from gevent import monkey, Timeout
from functools import wraps
from urlparse import urlparse
from flask import Flask, request, make_response, Response

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

if TX_QUEUE_URL and RX_QUEUE_URL:
    send_conn = pika.BlockingConnection(pika.URLParameters(TX_QUEUE_URL))
    recv_conn = pika.BlockingConnection(pika.URLParameters(RX_QUEUE_URL))
else:
    send_conn = pika.BlockingConnection(pika.ConnectionParameters(
        host='localhost'))
    recv_conn = pika.BlockingConnection(pika.ConnectionParameters(
        host='localhost'))

send_channel = send_conn.channel()
send_channel.exchange_declare(exchange=QUEUE_EXCHANGE, type='topic')

recv_channel = recv_conn.channel()
recv_channel.exchange_declare(exchange=QUEUE_EXCHANGE, type='topic')

monkey.patch_socket()

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
    return json.dumps(str(db.test_collection.find()))

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
    return json.dumps(client.add_subscriptions([{"name": request.args.get('stream_name')}]))

@app.route('/register', methods=["OPTIONS"])
@add_response_headers({'Access-Control-Allow-Origin': '*'})
@add_response_headers({'Access-Control-Allow-Headers': 'X-Requested-With'})
def register_options():
    return ''

@app.route('/register', methods=["GET"])
@require_key()
@add_response_headers({'Access-Control-Allow-Origin': '*'})
@add_response_headers({'Access-Control-Allow-Headers': 'X-Requested-With'})
def register():
    return json.dumps(client.register(event_types=["message"]))

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
    topic = request.args.get('topic')
    #last_event_id = request.args.get('last_event_id')
    # The same client has to supply the same handle every time. The first time it will be created;
    #   subsequently it will be reused.  Right now it's going to be leaked if you stop using it.
    channel_token = request.args.get('channel_token')

    queue_name = "channel_token_" + channel_token
    recv_queue = recv_channel.queue_declare(queue=queue_name)
    recv_channel.queue_bind(exchange=QUEUE_EXCHANGE,
        queue=queue_name,
        routing_key=topic)

    print "events"
    def generate():
        print "generate"
        body = None
        while body is None:
            print "body is none"
            try:
                timeout = Timeout(25)
                timeout.start()
                print "waiting to receive consume"
                (method_frame, properties, body) = next(recv_channel.consume(queue_name, no_ack=True))
                print "received consume"
                print "asdfasdfasdfasdf\n"
                print method_frame
                print properties
                print body
                print 'woeitsdklfjsfs\n'
            except Timeout:
                pass
            finally:
                timeout.cancel()
            yield body or ' '

    return Response(generate())

@app.route('/send', methods=["OPTIONS"])
@add_response_headers({'Access-Control-Allow-Origin': '*'})
@add_response_headers({'Access-Control-Allow-Headers': 'X-Requested-With'})
def send_options():
    return ''

@app.route('/send', methods=["GET"])
@require_key()
@add_response_headers({'Access-Control-Allow-Origin': '*'})
@add_response_headers({'Access-Control-Allow-Headers': 'X-Requested-With'})
def send():
    target = request.args.get('target')
    #subject = request.args.get('subject')
    #content = request.form.get('content')
    content = request.args.get('content')

    send_channel.basic_publish(exchange=QUEUE_EXCHANGE,
        routing_key=target,
        body=content)

    x = db.channels.update(
        {"name": target},
        {"$push": {"messages": {"from": "nobody", "content": content}}},
        upsert=True)
    return str(x)
    #return json.dumps(client.send_message({"type": typ, "to": to, "subject": subject, "content": content}))

@app.route('/public/<filename>')
def public(filename):
    logging.debug(filename)
    return app.send_static_file(filename)

# If we're run directly and not through gunicorn
if __name__ == '__main__':
    app.config['DEBUG'] = True
    app.run()
