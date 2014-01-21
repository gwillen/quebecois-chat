// Assume the presence of jQuery, because who doesn't have jQuery
VERSION = 56;
PROXY = 'http://scripts.x.rotq.net/';
//PROXY = 'http://localhost.rotq.net:5000/';

document.domain = 'rotq.net';

$(document).ready(function (){
	$.getScript(PROXY + 'public/zuliptest.js?v=' + VERSION, function() {
		QUEBECOIS.abuse_mediawiki();
	});
});
