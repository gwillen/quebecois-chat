if (!window.LOCALMODE) {
    LOCALMODE = false;
}

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
    //
    // Minor helper functions
    //

    var json_parse = function(data) {
        try {
            result = JSON.parse(data);
        } catch(e) {
            console.log("JSON parse error parsing '", data, "'; error was:", e);
            result = {"status": "error", "error": "JSON parse error: " + e};
        }
        return result;
    }

    var make_id = function(n)
    {
        var text = "";
        var possible = "0123456789abcdef";

        for (var i = 0; i < n; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }

        return text;
    };


    //
    // Class ChatConnection
    //

    // channels: list of channels to subscribe
    // msg_handler: callback for each message received (incl. scrollback)
    // clear_chat: called just before messages start flowing (and again if
    //   we lose our connection and start over from the beginning.)
    var ChatConnection = function(channels, msg_handler, clear_chat) {
        console.log("ChatConnection construction; this has uid ", this.uniqueId());
        // XXX go will make us a fresh token, is that what we really want
        this.connection_active = true;
        this.go(channels, msg_handler, clear_chat);
    };

    // For debugging purposes
    var _cc_id_ = 0;
    ChatConnection.prototype.uniqueId = function() {
        if (typeof this.__uniqueid == "undefined") {
            this.__uniqueid = ++_cc_id_;
        }
        return this.__uniqueid;
    };

    ChatConnection.prototype.close_connection = function (){
        this.connection_active = false;
    };

    ChatConnection.prototype.fresh_token = function() {
        this.channel_token = make_id(32);
        console.log("fresh channel token is ", this.channel_token, " on object with uid ", this.uniqueId());
    };

    ChatConnection.prototype.subscribe = function(channel, k) {
        console.log("getting", PROXY + 'subscribe?key=' + MAGIC_KEY + '&channel_token=' + this.channel_token + '&target=' + channel);
        $.get(PROXY + 'subscribe?key=' + MAGIC_KEY + '&channel_token=' + this.channel_token + '&target=' + channel, '', k);
    };

    ChatConnection.prototype.get_history_events = function(f, clear_chat) {
        $.get(PROXY + 'event_history?key=' + MAGIC_KEY + '&channel_token=' + this.channel_token, '', function(data, textstatus, jqxhr) {
            var result = json_parse(data);
            // In case we're restarting, clear at the last possible moment before replacing the contents.
            clear_chat();
            // XXX error checking
            var events = result.events;
            events.map(function(message) {
                // XXX this is a hack because our history stores 'messages' and not 'events', which maybe should 
                // 'true' for 'is historical', which should be better documented
                f({"message": message}, true);
            });
        });
    };

    // CONTRACT: get_events promises never to directly recurse into k or fatal; it will only trampoline them.
    ChatConnection.prototype.get_events = function(k, fatal) {
        var self = this;
        var request_channel_token = self.channel_token;
        var random_token = make_id(8);
        var domain = 'http://' + random_token + '.' + LONGPOLL_DOMAIN + '/';
        if (LOCALMODE) {
            var domain = 'http://' + LOCALMODE + '/';
        }

        $.ajax({
            url: domain + 'events?key=' + MAGIC_KEY + '&channel_token=' + self.channel_token,
            dataType: 'text',
            xhr: function() {
                QUEBECOIS.xhr = $.ajaxSettings.xhr();
                return QUEBECOIS.xhr;
            },
            success: function(data, textstatus, jqxhr) {
                QUEBECOIS.last_poll_time = (new Date().getTime())/1000;
                var result = json_parse(data);
                console.log("events endpoint returned", result);

                console.log(
                    "self.channel_token = ", self.channel_token,
                    " on conn with uid ", self.uniqueId(),
                    " (request_channel_token = ", request_channel_token,
                    ", result.channel_token = ", result.channel_token, ")");
                if (request_channel_token != self.channel_token) {
                    console.log("Bad request channel token, discarding stale return and cancelling further requests (Got: ", request_channel_token, ", expected:", self.channel_token, ")");
                    return;
                }
                if (!self.connection_active) {
                    console.log("Connection set to inactive, closing.");
                    return;
                }

                if (result.result == 'fatal') {
                    console.log("Fatal error, restarting everything");
                    fatal();
                    return;
                } else if (result.result == 'error') {
                    console.log("ERROR, BACKING OFF", result);
                    setTimeout($.proxy(k, undefined, []), ERROR_BACKOFF);
                    return;
                }

                events = result['events'];
                if (events == undefined) {
                    k([]);
                }
                k(events);
            },
            error: function(jqxhr, textstatus, errorthrown) {
                if (request_channel_token != self.channel_token) {
                    console.log("Bad request channel token, discarding stale return and cancelling further requests (Got: ",
                        request_channel_token, ", expected:", self.channel_token, ") (on error). Textstatus was:", textstatus, "; Error was:", errorthrown);
                    return;
                }
                if (!self.connection_active) {
                    console.log("Connection set to inactive, closing (on error). Textstatus was:", textstatus, "; Error was:", errorthrown);
                    return;
                }

                console.log("events endpoint failed, backing off. Textstatus was:", textstatus, "; Error was:", errorthrown);
                setTimeout($.proxy(k, undefined, []), ERROR_BACKOFF)
            }
        });
    };

    ChatConnection.prototype.each_event = function(f, fatal) {
        var self = this;
        this.get_events(function(events) {
            events.map(f);
            self.each_event(f, fatal);
        }, fatal);
    };

    ChatConnection.prototype.go = function(channels, f, clear_chat) {
        this.fresh_token();
        var self = this;
        var done_subscribing = function() {
            self.get_history_events(f, clear_chat);
            self.each_event(function(e) {
                if (!e.message) {
                    console.log("EVENT SANS MESSAGE", e);
                    return;
                }
                f(e);
            }, function() {
                self.go(channels, f, clear_chat);
            });
        };

        var subscribe_multiple = function(channels, k) {
            if (channels.length == 0) {
                k();
            } else {
                var ch = channels.shift();
                self.subscribe(ch, function() { subscribe_multiple(channels, k); });
            }
        };
        subscribe_multiple(channels.slice(), done_subscribing);  // slice without args performs clone
    };


    //
    // Connectionless chat operations
    //

    var send = function(channel, username, message) {
        $.post(PROXY + 'send?key=' + MAGIC_KEY + '&target=' + channel + '&sender=' + username,
            {"content": message},
            function(data, textstatus, jqxhr) {
                var result = json_parse(data);
                console.log("send endpoint returned", result);
            });
    };

    var get_channels = function(f) {
        $.get(PROXY + 'channels?key=' + MAGIC_KEY, function(data, textstatus, jqxhr) {
            var result = json_parse(data);
            // XXX error checking
            channels = result.channels;
            f(channels);
        });
    };


    //
    // HTML-swizzling helpers
    //

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


    //
    // Export selected functions
    //

    return {
        ChatConnection: ChatConnection,
        send: send,
        get_channels: get_channels,
        abuse_mediawiki: abuse_mediawiki,
        fixed_chatpane: fixed_chatpane,
        hide_chatpane: hide_chatpane
    }
})(this, jQuery);
