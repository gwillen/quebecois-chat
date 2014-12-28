//Needs jquery: <script src="//ajax.googleapis.com/ajax/libs/jquery/2.1.3/jquery.min.js"></script>

VERSION = 58;
PROXY = 'http://scripts.x.rotq.net/';
//PROXY = 'http://localhost.rotq.net:5000/';

document.domain = 'rotq.net';

$(document).ready(function (){
    $.getScript(PROXY + 'static/chatdebug.js');
    $.getScript(PROXY + 'static/chattest.js?v=' + VERSION, function() {
        QUEBECOIS.hijack_czar();
    });
});
