//Needs jquery: <script src="//ajax.googleapis.com/ajax/libs/jquery/2.1.3/jquery.min.js"></script>

parms = {};
location.
    search.
    substr(1).
    split('&').
    map(function(x) {
        var parm = x.split('=');
        parms[decodeURIComponent(parm[0])] = decodeURIComponent(parm[1]);
    });

PROXY = 'http://scripts.x.rotq.net/';
//PROXY = 'http://localhost.rotq.net:5000/';

document.domain = 'rotq.net';

var version = parms['v'] || window.top.config.script_version_magic;

$(document).ready(function (){
    $.getScript(PROXY + 'static/chatdebug.js?v=' + version);
    $.getScript(PROXY + 'static/chattest.js?v=' + version, function() {
        QUEBECOIS.hijack_czar();
    });
});
