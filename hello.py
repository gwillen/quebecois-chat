import sys
import logging
import os
import zulip
import json
import gevent
from gevent import monkey, Timeout
from functools import wraps
from flask import Flask, request, make_response, Response

monkey.patch_socket()

logging.basicConfig(filename='error.log',level=logging.DEBUG)

app = Flask(__name__)
app.config.from_pyfile('config.py')
client = zulip.Client(email="quebecois-bot@rotq.net", api_key="RBBq0ZjXLcfOAYaenBoe5veFDDmhT9ES")

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

@app.route('/subscribe', methods=["OPTIONS"])
@add_response_headers({'Access-Control-Allow-Origin': '*'})
@add_response_headers({'Access-Control-Allow-Headers': 'X-Requested-With'})
def subscribe_options():
	return ''

@app.route('/subscribe', methods=["GET"])
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
@add_response_headers({'Access-Control-Allow-Origin': '*'})
@add_response_headers({'Access-Control-Allow-Headers': 'X-Requested-With'})
def messages():
	typ = request.args.get('type')
	to = request.args.get('to')
	subject = request.args.get('subject')

	content = request.form.get('content')

	return json.dumps(client.send_message({"type": typ, "to": to, "subject": subject, "content": content}))