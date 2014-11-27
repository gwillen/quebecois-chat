import sys
import logging
import os
import zulip
import json
import gevent
import pymongo

from gevent import monkey, Timeout
from functools import wraps
from flask import Flask, request, make_response, Response

MAGIC_KEY = 'fhqwhgads'
MONGO_URL = os.environ.get('MONGOHQ_URL')

if MONGO_URL:
    # Get a connection
    conn = pymongo.Connection(MONGO_URL)
    
    # Get the database
    db = conn[urlparse(MONGO_URL).path[1:]]
else:
    # Not on an app with the MongoHQ add-on, do some localhost action
    conn = pymongo.Connection('localhost', 27017)
    db = conn['someapps-db']

monkey.patch_socket()

logging.basicConfig(filename='error.log',level=logging.DEBUG)

app = Flask(__name__)
app.config.from_pyfile('config.py')
client = zulip.Client(email="quebecois-bot@rotq.net", api_key="BfsqBUyxSfMzmKyguETDS3xbG7eNbRGv")

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
    db.test_collection.insert({"testdoc":"totaltest"})
    return json.dumps(db.test_collection.find())

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

@app.route('/messages', methods=["OPTIONS"])
@add_response_headers({'Access-Control-Allow-Origin': '*'})
@add_response_headers({'Access-Control-Allow-Headers': 'X-Requested-With'})
def messages_options():
	return ''

@app.route('/messages', methods=["POST"])
@require_key()
@add_response_headers({'Access-Control-Allow-Origin': '*'})
@add_response_headers({'Access-Control-Allow-Headers': 'X-Requested-With'})
def messages():
	typ = request.args.get('type')
	to = request.args.get('to')
	subject = request.args.get('subject')

	content = request.form.get('content')

	return json.dumps(client.send_message({"type": typ, "to": to, "subject": subject, "content": content}))

@app.route('/public/<filename>')
def public(filename):
	logging.debug(filename)
	return app.send_static_file(filename)
