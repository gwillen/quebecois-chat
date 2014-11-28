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

MAGIC_KEY = 'fhqwhgads'
MONGO_URL = os.environ.get('MONGOHQ_URL')
QUEUE_URL = os.environ.get('RABBITMQ_BIGWIG_URL')
QUEUE_EXCHANGE = 'test'

if MONGO_URL:
    mongo_conn = pymongo.Connection(MONGO_URL)
    db = mongo_conn[urlparse(MONGO_URL).path[1:]]
else:
    # Not on an app with the MongoHQ add-on, do some localhost action
    mongo_conn = pymongo.Connection('localhost', 27017)
    db = mongo_conn['someapps-db']

if QUEUE_URL:
    queue_conn = pika.BlockingConnection(pika.URLParameters(QUEUE_URL))
else:
    queue_conn = pika.BlockingConnection(pika.ConnectionParameters(
        host='localhost'))

queue_channel = queue_conn.channel()
queue_channel.exchange_declare(exchange=QUEUE_EXCHANGE, type='topic')

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
	queue_id = request.args.get('queue_id')
	last_event_id = request.args.get('last_event_id')
	def generate():
		result = None
		while result is None:
			try:
				timeout = Timeout(25)
				timeout.start()
				result = json.dumps(client.get_events(
					queue_id=queue_id,
					last_event_id=last_event_id))
				logging.debug('got a response')
			except Timeout:
				pass
			finally:
				timeout.cancel()
			yield result or ' '

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

    queue_channel.basic_publish(exchange=QUEUE_EXCHANGE,
        routing_key='foo.bar',
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
