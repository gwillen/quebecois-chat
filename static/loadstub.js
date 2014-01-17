// Assume the presence of jQuery, because who doesn't have jQuery
VERSION = 37;
PROXY = 'http://scripts.x.rotq.net/';
//PROXY = 'http://localhost:5000/';

document.domain = 'rotq.net';

$(document).ready(function (){
	$.getScript(PROXY + 'public/zuliptest.js?v=' + VERSION, function() {
		QUEBECOIS.abuse_mediawiki();
	});
});
