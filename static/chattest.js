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
CHAT_EXTRAS_HEIGHT = '47px';
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
	var make_id = function() {
    	var text = "";
    	var possible = "0123456789abcdef";
	    for (var i = 0; i < 32; i++ )
    	    text += possible.charAt(Math.floor(Math.random() * possible.length));
	    return text;
	}
	var channel_token = make_id();
	console.log("channel token is", channel_token);

	var subscribe = function(stream, k) {
		$.get(PROXY + 'subscribe?key=' + MAGIC_KEY + '&channel_token=' + channel_token + '&target=' + stream, '', k);
	};

	var make_id = function(n)
	{
		var text = "";
		var possible = "abcdefghijklmnopqrstuvwxyz";

		for (var i = 0; i < n; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}

		return text;
	};

	var get_history_events = function(f) {
		$.get(PROXY + 'event_history?key=' + MAGIC_KEY + '&channel_token=' + channel_token, '', function(data, textstatus, jqxhr) {
			var result = JSON.parse(data);
			result.map(function(message) {
				// XXX this is a hack because our history stores 'messages' and not 'events', which maybe should 
				// 'true' for 'is historical', which should be better documented
				f({"message": message}, true);
			});
		});
	};

	var get_events = function(k) {
		var random_token = make_id(7);
		var domain = 'http://' + random_token + '.' + LONGPOLL_DOMAIN + '/';
		if (LOCALMODE) {
			var domain = 'http://' + LOCALMODE + '/';
		}
		$.get(domain + 'events?key=' + MAGIC_KEY + '&channel_token=' + channel_token, '', function(data, textstatus, jqxhr) {
			var result = JSON.parse(data);
			console.log("events endpoint returned", result);
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
    	subscribe(stream, function() {
    		get_history_events(f);
    		each_event(function(e) {
				if (!e.message) {
					console.log("EVENT SANS MESSAGE", e);
					return;
				}
				f(e);
			});
		});
    };

    var send = function(stream, username, message) {
		$.post(PROXY + 'send?key=' + MAGIC_KEY + '&target=' + stream + '&sender=' + username,
			{"content": message},
			function(data, textstatus, jqxhr) {
				var result = JSON.parse(data);
				console.log("send endpoint returned", result);
			});
    }

	var abuse_mediawiki = function() {
		var username = $('#pt-userpage').text();
		var page_tag = $('body').attr('class').split(' ').filter(function(x) { return /^page-/.test(x) })[0];
		var page = page_tag.split('-').slice(1).join('-');
		var wikidiv = $('#globalWrapper');
		wikidiv.css({
			'position': 'absolute',
			'top': CHATPANE_HEIGHT,
			'margin-top': '10px'
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

	var hide_chatpane = function(flag) {
		if (flag) {
			$('#messages').css({'display': 'none'});
			window.parent.$('#chatpane').css({'height': CHAT_EXTRAS_HEIGHT});
			window.parent.$('#globalWrapper').css({'top': CHAT_EXTRAS_HEIGHT});
		} else {
			$('#messages').css({'display': 'block'});
			window.parent.$('#chatpane').css({'height': CHATPANE_HEIGHT});
			window.parent.$('#globalWrapper').css({'top': CHATPANE_HEIGHT});
		}
	};

    return {
		go: go,
		send: send,
		abuse_mediawiki: abuse_mediawiki,
		fixed_chatpane: fixed_chatpane,
		hide_chatpane: hide_chatpane
    }
})(this, jQuery);