import sys
import logging
import os
import zulip
import json
import gevent
from gevent import monkey
from functools import wraps
from flask import Flask, request, make_response

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

@app.route('/register', methods=["GET", "OPTIONS"])
@add_response_headers({'Access-Control-Allow-Origin': '*'})
@add_response_headers({'Access-Control-Allow-Headers': 'X-Requested-With'})
def register():
	return json.dumps(client.register(event_types=["message"]))

@app.route('/events')
@add_response_headers({'Access-Control-Allow-Origin': '*'})
@add_response_headers({'Access-Control-Allow-Headers': 'X-Requested-With'})
def events():
	return json.dumps(client.get_events(
		queue_id=request.args.get('queue_id'),
		last_event_id=request.args.get('last_event_id')))

@app.route('/')
def hello():
	logging.debug("test1")

	gevent.socket.create_connection(('1.1.1.1', 80))
	logging.debug("test2")

	#client.send_message({
#		"type": "stream",
#		"to": "misc",
#		"subject": "bot_test",
#		"content": "Hello, Heroku!" })
	return "Done."
