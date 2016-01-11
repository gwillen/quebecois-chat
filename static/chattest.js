var config;

// I can't decide if this is great or terrible. Try each suffix of the domain in turn until we find the GCD.

while (config == undefined && document.domain.indexOf(".") > -1) {
    console.log("trying document.domain =", document.domain);
    try {
        config = window.top.config;
        // This is required because Safari, in its infinite wisdom, does not throw an exception here.
        if (config) {
            break;
        }
    } catch(e) {}
    document.domain = document.domain.split(".").slice(1).join(".");
}

if (!config) {
    console.log("FAILED TO LOCATE CONFIG");
}

PROXY = 'http://scripts.' + config.chat_domain + '/';
LONGPOLL_DOMAIN = config.chat_domain;
LONGPOLL_WORKAROUND_DISABLED = config.chat_longpoll_workaround_disabled;

CHATPANE_HEIGHT = '100%';  // constant for historical reasons
CHAT_EXTRAS_HEIGHT = '21px';
//CHATPANE_HEIGHT = '20px';
ERROR_BACKOFF = 30 * 1000; // ms

MAGIC_KEY = 'fhqwhgads';

parms = {};
location.
    search.
    substr(1).
    split('&').
    map(function(x) {
        var parm = x.split('=');
        parms[decodeURIComponent(parm[0])] = decodeURIComponent(parm[1]);
    });

var version = parms['v'] || window.top.config.chat_cachebuster;

QUEBECOIS = (function(window, $, undefined){
    //
    // Minor helper functions
    //

    var json_parse = function(data) {
        try {
            result = JSON.parse(data);
        } catch(e) {
            // XXX most or all our logs should have timestamps. And it would be nice if there was some way to see in the log when we reestablished the link after dying (but probably without getting a log line every time we call /events again.)
            console.log("JSON parse error parsing '", data, "'; error was:", e);
            result = {"result": "error", "error": "JSON parse error: " + e};
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

    var get_domain = function() {
        if (LONGPOLL_WORKAROUND_DISABLED) {
            return 'http://' + LONGPOLL_DOMAIN + '/';
        } else {
            var random_token = make_id(8);
            return 'http://' + random_token + '.' + LONGPOLL_DOMAIN + '/';
        }
    };

    var now = function() {
        return Date.now() / 1000;
    };

    var TYPING_TIMEOUT = 5;
    var ACTIVE_TIMEOUT = 30;
    var PRESENCE_UPDATE_INTERVAL_MS = 30 * 1000;

    var PresenceStateEnum = {
        DISCONNECTED: -1,
        HIDDEN: 0,
        VISIBLE: 1,
        FOCUSED: 2
    };

    //
    // Class ChatConnection
    //

    // channels: list of channels to subscribe (presence will only be applied to first; this is hacky)
    // username: username for presence purposes
    // msg_handler: callback for each message received (incl. scrollback)
    // clear_chat: called just before messages start flowing (and again if
    //   we lose our connection and start over from the beginning.)
    var ChatConnection = function(channels, username, msg_handler, clear_chat) {
        // XXX go will make us a fresh channel_token, is that what we really want

        // 'Active' means we're trying to use this connection and is cleared when we replace it.
        // 'Working' means this connection is actually connected, and is cleared when we are in an error condition.
        this.connection_active = true;
        this.connection_working = true;

        this.presence = {
            target: channels[0],
            sender: username,
            presence_token: make_id(8),
            state: undefined,
            last_activity: 0,
            last_typing: 0,
            entered_text: false,
        };
        this.last_presence_update = now();
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

    // Our presence info works as follows:
    // - state is "HIDDEN" or "VISIBLE" or "FOCUSED"
    // - typing is true or false, only applies in FOCUSED state
    // - idle is how many seconds since last typing or mousemove, only applies in FOCUSED state

    ChatConnection.prototype.update_presence = function() {
        if (this.presence.sender == "Nobody") {
            // Hax
            console.log("update_presence: bailing because username is Nobody");
            return;
        }
        // This prevents us from updating our presence in the channel if we're not getting events from it for whatever reason
        if (!this.connection_active || !this.connection_working) {
            console.log("update_presence: bailing because the connection is bad");
            return;
        }
        var presence_data = this.presence;

        console.log(" now is ", now(), "; lt is ", presence_data.last_typing, "; diff is ", (now() - presence_data.last_typing), "; typing is ", (now() - presence_data.last_typing) < TYPING_TIMEOUT);
        presence_data.typing = (now() - presence_data.last_typing) < TYPING_TIMEOUT;
        presence_data.entered_text = $('#message_out').val().length > 0; // This is hacky abstraction-violation.
        var args = {
            key: MAGIC_KEY,
        }
        $.extend(args, presence_data);
        console.log("updating with", presence_data);
        $.get(get_domain() + 'update_presence?' + $.param(args), function(data, textstatus, jqxhr) {
            //var result = json_parse(data);
            console.log("did presence update; data is", presence_data);
        });
    };

    ChatConnection.prototype.set_presence_state = function(state) {
        var oldstate = this.presence.state;
        this.presence.state = state;
        if (state != oldstate) {
            this.update_presence();
        }
    };

    ChatConnection.prototype.reset_active_timer = function() {
        var oldact = this.presence.last_activity;
        this.presence.last_activity = now();
        if (this.presence.last_activity - oldact > ACTIVE_TIMEOUT) {
            this.update_presence();
        }
    };

    // XXX this bit still needs work.
    // In theory we need to force updates every TYPING_TIMEOUT intervals while the user is typing, and potentially another one TYPING_TIMEOUT after they stop, depending on how we want to handle the client side.
    ChatConnection.prototype.reset_typing_timer = function() {
        var oldtyping = this.presence.last_typing;
        this.presence.last_typing = now();
        if (this.presence.last_typing - oldtyping > TYPING_TIMEOUT) {
            this.update_presence();
        }
    }

    ChatConnection.prototype.close_connection = function (){
        this.connection_active = false;
        this.connection_working = false;
        this.presence_state = PresenceStateEnum.DISCONNECTED;
        this.update_presence();
    };

    ChatConnection.prototype.fresh_token = function() {
        this.channel_token = make_id(32);
        console.log("fresh channel token is ", this.channel_token, " on object with uid ", this.uniqueId());
    };

    // XXX: if subscribe or g_h_e or get_channels fails, we probably want to bail and restart the world rather than crashing as we do now.
    // There are some weird potential failure modes right now -- subscribe fails, we somehow make it to ghe anyway, we get empty events and blow up on line 116 because result.events is undefined???
    // If we manage to fail to create the queue, we survive anyway because we blow up trying to do /events and start all over. But if we failed, say, ghe but not subscribe, we could end up wedged in a half-cocked state.
    ChatConnection.prototype.subscribe = function(channel, k) {
        var domain = get_domain();
        console.log("getting", domain + 'subscribe?key=' + MAGIC_KEY + '&channel_token=' + this.channel_token + '&target=' + channel);
        $.get(domain + 'subscribe?key=' + MAGIC_KEY + '&channel_token=' + this.channel_token + '&target=' + channel, '', k);
    };

    ChatConnection.prototype.get_history_events = function(channels, f, clear_chat) {
        $.get(get_domain() + 'event_history?key=' + MAGIC_KEY + '&channel_token=' + this.channel_token + '&' + $.param({'channels': channels}, true), '', function(data, textstatus, jqxhr) {
            var result = json_parse(data);
            // In case we're restarting, clear at the last possible moment before replacing the contents.
            clear_chat();
            // XXX error checking
            var events = result.events; // XXX undef
            if (events.length == 0) {
                events = [{
                    from: {
                        user: 'SYSTEM'
                    },
                    content: "Nobody's said anything here yet!",
                    timestamp: 0
                }];
            }
            events.map(function(message) {
                // XXX this is a hack because our history stores 'messages' and not 'events', which maybe should 
                f({"type": "message", "message": message, "historical": true});
            });
        });
    };

    // CONTRACT: get_events promises never to directly recurse into k or fatal; it will only trampoline them.
    ChatConnection.prototype.get_events = function(k, fatal) {
        var self = this;
        var request_channel_token = self.channel_token;
        var domain = get_domain();

        $.ajax({
            url: domain + 'events?key=' + MAGIC_KEY + '&channel_token=' + self.channel_token,
            dataType: 'text',
            xhr: function() {
                QUEBECOIS.xhr = $.ajaxSettings.xhr();
                return QUEBECOIS.xhr;
            },
            success: function(data, textstatus, jqxhr) {
                self.connection_working = true;

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
                    self.connection_working = false;
                    console.log("Connection set to inactive, closing.");
                    return;
                }

                if (result.result == 'fatal') {
                    console.log("Fatal error, restarting everything");
                    self.connection_working = false;
                    fatal();
                    return;
                } else if (result.result == 'error') {
                    console.log("ERROR, BACKING OFF", result);
                    self.connection_working = false;
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
                self.connection_working = false;

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

    // There's no compelling reason for this function to care about channel_token, _except_ that a 
    //   change to it implies that we've reset our connection, and are about to start a new 
    //   presence update loop, so we should terminate the old one. This is a hack.
    ChatConnection.prototype.keep_presence_updated = function(channel_token) {
        console.log("keep_presence_updated; cht is", channel_token, "; pt is", this.presence.presence_token, "; data is", this.presence, "; conn is", this);
        if (!this.connection_active) {
            console.log("keep_presence_updated: bailing because connection inactive");
            return;
        }
        // This is a hack; see above.
        if (this.channel_token != channel_token) {
            console.log("keep_presence_updated: bailing because channel_token changed (old:", channel_token, "; new:", this.channel_token, ")");
            return;
        }
        if (this.presence.sender == "Nobody") {
            // Hax
            console.log("keep_presence_updated: bailing because username is Nobody");
            return;
        }
        var self = this;
        this.update_presence();
        setTimeout(function() { self.keep_presence_updated(channel_token); }, PRESENCE_UPDATE_INTERVAL_MS);
    };

    ChatConnection.prototype.go = function(channels, f, clear_chat) {
        this.fresh_token();
        var self = this;
        var done_subscribing = function() {
            self.get_history_events(channels, f, clear_chat);
            self.each_event(function(e) {
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
        // Put this off until the caller has had a chance to initialize presence based on window visibility and focus.
        setTimeout(function() { self.keep_presence_updated(self.channel_token) }, 0);
    };


    //
    // Connectionless chat operations
    //

    var send = function(channel, username, message) {
        $.post(get_domain() + 'send?key=' + MAGIC_KEY + '&target=' + channel + '&sender=' + username,
            {"content": message},
            function(data, textstatus, jqxhr) {
                var result = json_parse(data);
                console.log("send endpoint returned", result);
            });
    };

    var get_channels = function(f) {
        $.ajax(get_domain() + 'channels?key=' + MAGIC_KEY, {
            success: function(data, textstatus, jqxhr) {
                try {
                    var result = json_parse(data);
                    console.log("get_channels parsed result: ", result);
                    f(result.channels);
                } catch(e) {
                    console.log("get_channels got exception: ", e);
                    f(undefined);
                }
            },
            error: function(jqxhr, textstatus, errorthrown) {
                console.log("get_channels received xhr error", jqxhr, textstatus, errorthrown);
                f(undefined);
            }
        });

    };


    //
    // HTML-swizzling helpers
    //

    var setup_complete = false;

    var hijack_czar = function() {
        var username = config.username;
        var channel = config.channel;

        var chatwrapper = $('#chat-wrapper');

        var chatpane = $('#chatpane');
        if (chatpane.length == 0) {
            chatpane = $('<div id="chatpane">');
            chatwrapper.html("");
            chatwrapper.append(chatpane);
        }

        chatpane.css({
            'background-color': 'white',
            'height': '100%',
            'z-index': 1000,
            'width': '100%'
        });

        var chatsrc = PROXY + 'static/chattest.html?v=' + version + '&user=' + username + '&channel=' + channel;
        console.log("Setting up chat frame with src = ", chatsrc);
        var chatframe = $('#chatframe');
        if (!chatframe.length) {
            chatpane.html('<iframe src="' + chatsrc + '" id="chatframe"></iframe>');
            chatframe = $('#chatframe');
        } else {
            // This will cause the frame to reload.
            chatframe.attr('src', chatsrc);
        }

        chatframe.css({
            'width': '100%',
            'height': CHATPANE_HEIGHT,
            'border': '0px',
            'border-bottom': '1px solid black'
        });
    };

    //
    // Export selected functions
    //

    return {
        ChatConnection: ChatConnection,
        PresenceStateEnum: PresenceStateEnum,
        send: send,
        get_channels: get_channels,
        hijack_czar: hijack_czar,
    }
})(this, jQuery);
