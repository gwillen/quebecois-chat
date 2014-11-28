#!/usr/bin/env python
import pika
import sys
import os

RABBITMQ_BIGWIG_RX_URL = os.environ.get('RABBITMQ_BIGWIG_RX_URL')
QUEUE_EXCHANGE = 'test'

if RABBITMQ_BIGWIG_RX_URL:
    connection = pika.BlockingConnection(pika.URLParameters(
        RABBITMQ_BIGWIG_RX_URL))
else:
    connection = pika.BlockingConnection(pika.ConnectionParameters(
        host='localhost'))

channel = connection.channel()

channel.exchange_declare(exchange=QUEUE_EXCHANGE,
                         type='topic')

result = channel.queue_declare(exclusive=True)
queue_name = result.method.queue

binding_keys = sys.argv[1:]
if not binding_keys:
    print >> sys.stderr, "Usage: %s [binding_key]..." % (sys.argv[0],)
    sys.exit(1)

for binding_key in binding_keys:
    channel.queue_bind(exchange='test',
                       queue=queue_name,
                       routing_key=binding_key)

print ' [*] Waiting for logs. To exit press CTRL+C'

def callback(ch, method, properties, body):
    print " [x] %r:%r" % (method.routing_key, body,)

#channel.basic_consume(callback,
#                      queue=queue_name,
#                      no_ack=True)
#
#channel.start_consuming()

for method_frame, properties, body in channel.consume(queue_name, no_ack=True):
    callback(None, method_frame, properties, body)