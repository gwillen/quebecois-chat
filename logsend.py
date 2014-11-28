#!/usr/bin/env python
import pika
import sys
import os

RABBITMQ_BIGWIG_TX_URL = os.environ.get('RABBITMQ_BIGWIG_TX_URL')
QUEUE_EXCHANGE = 'test'

if RABBITMQ_BIGWIG_TX_URL:
    connection = pika.BlockingConnection(pika.URLParameters(
        RABBITMQ_BIGWIG_TX_URL))
else:
    connection = pika.BlockingConnection(pika.ConnectionParameters(
        host='localhost'))

channel = connection.channel()

channel.exchange_declare(exchange=QUEUE_EXCHANGE,
                         type='topic')

routing_key = sys.argv[1] if len(sys.argv) > 1 else 'anonymous.info'
message = ' '.join(sys.argv[2:]) or 'Hello World!'
channel.basic_publish(exchange=QUEUE_EXCHANGE,
                      routing_key=routing_key,
                      body=message)
print " [x] Sent %r:%r" % (routing_key, message)
connection.close()