// Assume the presence of jQuery, because who doesn't have jQuery
VERSION = 17;
PROXY = 'http://quebecois.herokuapp.com/';
//PROXY = 'http://localhost:5000/';

$(document).ready(function (){
	$.getScript(PROXY + 'public/zuliptest.js?v=' + VERSION, function() {
		QUEBECOIS.abuse_mediawiki();
	});
});
