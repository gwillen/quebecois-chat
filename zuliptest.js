PROXY = 'http://quebecois.herokuapp.com/';
BOT_EMAIL = 'quebecois-bot@rotq.net';

QUEBECOIS = (function(window, $, undefined){
	var queue_id = undefined;
	var last_event_id = undefined;

	var register = function(k) {
		$.get(PROXY + 'register', '', function(data, textstatus, jqxhr) {
			var result = JSON.parse(data);
			console.log(result);
			queue_id = result['queue_id'];
			last_event_id = result['last_event_id'];
			k();
		});
	};

	var get_events = function(k) {
		$.get(PROXY + 'events?queue_id=' + queue_id + '&last_event_id=' + last_event_id, '', function(data, textstatus, jqxhr) {
			var result = JSON.parse(data);
			console.log(result);
			events = result['events'];
			last_event_id = events[events.length - 1]['id'];
			k(events);
		});
    };

    var each_event = function(f) {
		get_events(function(events) {
			events.map(f);
			setTimeout(0, each_event(f));
		});
    };

    var go = function(stream, topic, f) {
		register(function() {
			each_event(function(e) {
				if (e.message.type != 'stream') {
					return;
				} else if (e.message.display_recipient != stream) {
					return;
				} else if (e.message.subject != topic) {
					return;
				}
				f(e);
			});
		});
    };

    var send = function(stream, topic, message) {
		$.post(PROXY + 'messages?type=stream&to=' + stream + '&subject=' + topic,
			{"content": message},
			function(data, textstatus, jqxhr) {
				var result = JSON.parse(data);
				console.log(result);
			});
    }

    return {
		go: go,
		send: send
    }
})(this, jQuery);

QUEBECOIS.go('misc', 'bot test 2',
	function(e) {
		console.log("GOT EVENT", e);
		var sender = e.message.sender_full_name;
		var content = e.message.content;
		var message = '';
		if (e.message.sender_email == BOT_EMAIL) {
			message = content;
		} else {
			message = '[' + sender + '] ' + content;
		}

		var msg_div = $('<div>');
		msg_div.text(message);
		$('#messages').append(msg_div);
	});
