/////
//LOCALMODE = 'localhost.rotq.net:5000';
LOCALMODE = false;
/////

PROXY = 'http://scripts.x.rotq.net/';
LONGPOLL_DOMAIN = 'x.rotq.net';
if (LOCALMODE) {
	PROXY = 'http://localhost.rotq.net:5000/';
}
BOT_EMAIL = 'quebecois-bot@rotq.net';
BOT_NAME = "The Rage of the Quebecois bot";
CHATPANE_HEIGHT = '240px';
//CHATPANE_HEIGHT = '20px';
DEFAULT_STREAM = 'wiki';
ERROR_BACKOFF = 30 * 1000; // ms

MAGIC_KEY = 'fhqwhgads';


document.domain = 'rotq.net';

parms = {};
location.
	search.
	substr(1).
	split('&').
	map(function(x) {
		var parm = x.split('=');
		parms[parm[0]] = parm[1];
	});

QUEBECOIS = (function(window, $, undefined){
	var queue_id = undefined;
	var last_event_id = undefined;

	var subscribe = function(stream, k) {
		$.get(PROXY + 'subscribe?key=' + MAGIC_KEY + '&stream_name=' + stream, '', k);
	};

	var create_stream = function(stream, k) {
		// I'm as puzzled as you are.
		subscribe(stream, function(data, textstatus, jqxhr) {
			var result = JSON.parse(data);
			console.log("CREATE STREAM", stream, result);
			if (result.subscribed[BOT_EMAIL]) {
				// This is a new subscription; since our intent was to create the stream, presume that we did so, and announce it.
				send('zulip', 'Streams', BOT_NAME + ' just created a new stream `' + stream + '`. To join, visit your [Streams page](https://zulip.com/#subscriptions).');
			}
			k();
		});
	};

	var register = function(k) {
		$.get(PROXY + 'register?key=' + MAGIC_KEY, '', function(data, textstatus, jqxhr) {
			var result = JSON.parse(data);
			console.log(result);
			queue_id = result['queue_id'];
			last_event_id = result['last_event_id'];
			k();
		});
	};

	var make_id = function(n)
	{
		var text = "";
		var possible = "abcdefghijklmnopqrstuvwxyz";

		for (var i = 0; i < n; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}

		return text;
	}

	var get_events = function(k) {
		var random_token = make_id(7);
		var domain = 'http://' + random_token + '.' + LONGPOLL_DOMAIN + '/';
		if (LOCALMODE) {
			var domain = 'http://' + LOCALMODE + '/';
		}
		$.get(domain + 'events?key=' + MAGIC_KEY + '&queue_id=' + queue_id + '&last_event_id=' + last_event_id, '', function(data, textstatus, jqxhr) {
			var result = JSON.parse(data);
			console.log(result);
			if (result.result == 'error') {
				console.log("ERROR, BACKING OFF", result);
				setTimeout(function() {
					k([]);
				}, ERROR_BACKOFF);
				return;
			}
			events = result['events'];
			if (events == undefined) {
				k([]);
			}
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
				if (!e.message) {
					console.log("EVENT SANS MESSAGE", e);
					return;
				}
				if (e.message.type != 'stream') {
					return;
				} else if (stream != '*' && e.message.display_recipient != stream) {
					return;
				} else if (topic != '*' && e.message.subject != topic) {
					return;
				}
				f(e);
			});
		});
    };

    var send = function(stream, topic, message, autovivify) {
		$.post(PROXY + 'messages?key=' + MAGIC_KEY + '&type=stream&to=' + stream + '&subject=' + topic,
			{"content": message},
			function(data, textstatus, jqxhr) {
				var result = JSON.parse(data);
				console.log(result);
				if (autovivify && (result.msg == 'Stream does not exist')) {
					create_stream(stream, function() {
						// Never autovivify again, to avoid recursing in weird cases.
						send(stream, topic, message);
					});
				}
			});
    }

	var abuse_mediawiki = function() {
		var username = $('#pt-userpage').text();
		var page_tag = $('body').attr('class').split(' ').filter(function(x) { return /^page-/.test(x) })[0];
		var page = page_tag.split('-').slice(1).join('-');
		var wikidiv = $('#globalWrapper');
		wikidiv.css({
			'position': 'absolute',
			'top': '250px'
		});
		var body = $('body');
		$('body').prepend($('<div id="chatpane">'));
		var chatpane = $('#chatpane');
		chatpane.css({
			'background-color': 'white',
			'height': CHATPANE_HEIGHT,
			'z-index': 1000,
			'width': '100%'
		});
		chatpane.append($('<iframe src="' + PROXY + 'public/zuliptest.html?v=' + VERSION + '&user=' + username + '&page=' + page + '" id="zulipframe"></iframe>'));
		var zulipframe = $('#zulipframe');
		zulipframe.css({
			'width': '100%',
			'height': '100%',
			'border': '0px',
			'border-bottom': '1px solid black'
		});
	};

	var fixed_chatpane = function(flag) {
		if (flag) {
			window.parent.$('#chatpane').css({'position': 'fixed'});
		} else {
			window.parent.$('#chatpane').css({'position': 'absolute'});
		}
	};

    return {
		go: go,
		send: send,
		abuse_mediawiki: abuse_mediawiki,
		fixed_chatpane: fixed_chatpane
    }
})(this, jQuery);
