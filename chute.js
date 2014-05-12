var isFirefox = false;
var otherWasDead = false;

var global_channel = null;
var global_socket = null;
var global_connection = null;
var global_datachannel = null;

var dc_opened_flag = false;
var clientID = "{{ uuid }}";
var roomname = "{{ roomname }}";
var partner = null;
var clientType = null;
var file = null;
// var filename = null;
// var filesize = null;
// var filetype = null;
var iceArray = [];
var isReceiving = false;
var isSending = false;
var isWriting = false;
var inFileSelect = false;
var choseAFile = false;
var iceCandidateArray = [];
var fs = null;
var isLockedOut = false;
var timer = null;

/* Buttons */
var files = $('#files')[0];
var connButton = $('#connectButton')[0];
var status = $('p');
var fileInfo = $('#fileInfo');
var fileName = $('#fileName');
var fileSize = $('#fileSize');
var fileTime = $('#fileTime');
var cancelButton = $('#fileclose');
var fakeCancelButton = $('#fileInfoEmpty');
var fileInfoWrapper = $('#fileInfoWrapper');
var instructionButton = $('#instructionButton');
var instructions = $('#instructions');

window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;

var isFinished = false;
var sliceStart = 0;
var sliceEnd = 0;
var chunksSent = 0;
var totalChunks = 0;

var chunkSize = 16000;

//drag-and-drop
$(document).on('dragenter', function (e)
{
  	e.stopPropagation();
  	e.preventDefault();
});
$(document).on('dragover', function (e)
{
  	e.stopPropagation();
  	e.preventDefault();
});
$(document).on('drop', function (e)
{
	e.stopPropagation();
  	e.preventDefault();
  	//$('#outer').css('border', '4px dashed rgba(0, 0, 0, 0.2)');
  	if (inFileSelect && !isLockedOut)
  	{
		files = e.originalEvent.dataTransfer.files;
		file = files[0]
		//console.log(files[0]);
		//fileInfo.html(files[0].name);
		selectFile(file);
	}
});

/*$('.wrapper').on('dragenter', function (e)
{
  e.stopPropagation();
  e.preventDefault();
});
$('.wrapper').on('dragover', function (e)
{
  e.stopPropagation();
  e.preventDefault();
  $(this).css('border', '4px dashed rgba(0, 0, 0, 0.6)');
});
$('.wrapper').on('dragleave', function(e) {
  $(this).css('border', '4px dashed rgba(0, 0, 0, 0.2)');
});
$('.wrapper').on('drop', function(e) {
  $(this).css('border', '4px dashed rgba(0, 0, 0, 0.2)');
  files = e.originalEvent.dataTransfer.files;
  console.log(files[0].name);
  fileInfo.html(files[0].name);
  //$('#center div').text(files[0].name);
});*/

/* General functions used by both clients. Shouldn't ever be caused by client interaction (button, onload, etc) */
function signalingServer() {
	// Returns signalling server. Sets one up if not already set up.
	if (global_channel == null)
	{
		global_channel = new goog.appengine.Channel('{{ token }}');
	}
	if (global_socket == null)
	{
		global_socket = global_channel.open();
		setupGlobalSocket();
	}

	return global_socket;
}

function setupGlobalSocket()
{
	var pc = peerConnection();
	global_socket.onopen = function()
	{
		console.log("Socket opened");
		initConnection();
	}

	global_socket.onmessage = function(e)
	{
		var data = JSON.parse(e.data);
		if (data.dest != clientID) { return; }
		if (data.partnerID) {
			partner = data.partnerID;
			sendOffer();
		}
		else if (data.offerSDP) {
			$('.text').html('Connecting...');
			instructions.text('Welcome to Chute! Your partner is on the other side and we\'re connecting you now. It shouldn\'t take more than a few seconds.');

			pc.setRemoteDescription(new RTCSessionDescription(data.offerSDP));

			for (var i = 0; i < iceArray.length; i++)
			{
				pc.addIceCandidate(new RTCIceCandidate({
					candidate     : iceArray[i].candidate.candidate,
					sdpMLineIndex : iceArray[i].candidate.sdpMLineIndex
				}));
				console.log("Adding ice candidates after receiving answer");
			}
			sendAnswer();
			console.log("Received offer");
		} else if (data.answerSDP) {
			instructions.text('Your partner has joined on the other side and we\'re connecting you now. It shouldn\'t take more than a few seconds.');
			$('.text').html('Connecting...');

			pc.setRemoteDescription(new RTCSessionDescription(data.answerSDP));
			for (var i = 0; i < iceArray.length; i++)
			{
				pc.addIceCandidate(new RTCIceCandidate({
					candidate     : iceArray[i].candidate.candidate,
					sdpMLineIndex : iceArray[i].candidate.sdpMLineIndex
				}));
				console.log("Adding ice candidates after receiving answer");
			}

			console.log("Received answer");
		} else if (data.candidate) {
			console.log("Received ICE candidate");

			if (!pc.remoteDescription)
				iceArray.push(data);
			else
			{
				pc.addIceCandidate(new RTCIceCandidate({
					candidate     : data.candidate.candidate,
					sdpMLineIndex : data.candidate.sdpMLineIndex
				}));
			}
		} else if (data.dead) {
			otherWasDead = true;
			console.log("Your partner has closed the connection. Please make a new room");
			console.log("Dead");

			// window.location.href = '/';
			//window.location = window.location.hostname;
		}
	}

	global_socket.onerror = function() {
		console.log("An error occurred");
	}
	global_socket.onclose = function() {
		console.log("Channel closed");
		global_socket = null;
	}
}

function initConnection()
{
	$.post("/opened", JSON.stringify({
		clientID : clientID,
		roomname : roomname
		}), function(returned_data) {
			console.log("Notified server we are ready");
			console.log(returned_data);
			data = JSON.parse(returned_data);

			if (data.roomFull) {
				alert('Room is full');
				return;
			}
			if (!roomname) {
				roomname = data.roomname;
				window.history.pushState({"pageTitle": "Chute " + roomname} ,"", "/c/" + roomname);
				$('#link').val(document.URL);
			}
			$('#link').click();

			$('#pageTitle').html("Chute " + roomname);
			clientType = data.clientType;
			partner = data.partner;
			console.log('Client type ' + clientType);
			if (clientType == 1)
			{
				//$('#status').html('Ready for partner to join');
				dataChannel();
			}
			else if (clientType == 2) {
				$.post("/message", JSON.stringify({
							dest      :	partner,
							partnerID : clientID
				}), function () {}); //$('#status').html('Connecting to partner');});
			}
		});
}

function peerConnection() {
	// RTCPeerConnection. Sets one up if not already set up.
	console.log(global_connection);
	if (global_connection == null) {

		if (isFirefox)
		{
			console.log("We're in Firefox");
			global_connection = new mozRTCPeerConnection({
				iceServers: [{"url": "stun:stun.l.google.com:19302"}],
				optional: []
			});
		}
		else
		{
			console.log("We're in Chrome or Opera");
			global_connection = new webkitRTCPeerConnection({
				iceServers: [{"url": "stun:stun.l.google.com:19302"}],
				optional: []
			});
		}

		global_connection.onicecandidate = function(event) {
			var candidate = event.candidate;
			// Muaz Khan version
			// if (typeof candidate == 'undefined') {
			// 	// send_SDP();
			// }
			if (candidate) {
				iceCandidateArray.push(candidate);

				$.post("/message", JSON.stringify({
					dest      :	partner,
					candidate : candidate
				}), function () { console.log("Sent ice"); });
			}
		}

		// Muaz Khan version
		// global_connection.ongatheringchange = function(event) {
		// 	if (event.currentTarget &&
		// 		event.currentTarget.iceGatheringState === 'complete') {
		// 		// send_SDP();
		// 	}
		// }

		// Muaz Khan version
		// function send_SDP() {
		// 	global_socket.send({
		// 		targetUser: 'target-user-id',
		// 		sdp 	  : global_connection.localDescription
		// 	});
		// }

		global_connection.ondatachannel = function(event) {
			console.log("Data channel received");
			global_datachannel = event.channel;
			setupGlobalDataChannel();
		}

		global_connection.onsignalingstatechange = function(event)
		{
			if(global_connection.signalingState == 'closed')
			{
				console.log('Closed RTC Peer Connection');
				global_connection = null;
				dc_opened_flag = false;
				clientType = 1;
				setupGlobalSocket();
				//$('#status').html('Ready for partner to join');
				dataChannel();
				resetButton();
				$('.mask').unbind('click');
				$('#content').css('margin-top', 0 + 'px');
				$('.text').html("Share this link");

				//moveButtonBack();

				var cookie_val = $.cookie(roomname);

			/*	fs.root.getFile(
					cookie_val.name,
					options,
					function(fileEntry)
					{
						downloadFile(fileEntry, cookie_val.name+".part", null);
					});
			*/

			}
		}

		global_connection.oniceconnectionstatechange = function(event) {
			if (global_connection.iceConnectionState == 'connecting')
			{
				console.log("Establishing ICE connection...");
			}
			else if (global_connection.iceConnectionState == 'connected')
			{
				if (otherWasDead)
					for (var i = 0; i < iceCandidateArray.length; i++) {
						//iceCandidateArray[i]
						$.post("/message", JSON.stringify({
							dest      :	partner,
							candidate : iceCandidateArray[i]
						}), function () { console.log("Sent ice"); });
					};
				console.log("ICE connection established");
			}
			else if (global_connection.iceConnectionState == 'disconnected')
			{
				console.log("ICE connection lost");
				global_datachannel.close();
				global_connection.close();
			}
		}
	};
	return global_connection;
}

var chunksPerWrite = 16;

function setupGlobalDataChannel() {
	global_datachannel.onerror = function(e) { console.log("DC error: ", e); }

	//var builder = new WebKitBlobBuilder();
	var dc = dataChannel();
	var numChunks = -1;
	var chunksReceived = 0;
	//var tempBlob = new Blob([]);
	var tempArray = [];
	var writeSize = chunksPerWrite * chunkSize;
	var tempFileExists = false;

	var filename, filesize, filetype;

	global_datachannel.onmessage = function(event) {
		//console.log("Received data", event.data);
		//$('#receive')[0].innerHTML = event.data;
		try
		{
			var data = JSON.parse(event.data);
			//console.log("flag1");

			if (data.fileChosen)
			{
				lockFileSelect();
			}
			else if (data.fileRemoved)
			{
				console.log('not locked out anymore');
				unlockFileSelect();
			}
			else if (data.received)
			{
				if (!isSending)
				{
					timer.start();
					isSending = true;
					instructions.text('Your partner has accepted the file and the transfer has started. The progress bar above shows how much has been sent.');
				}
				console.log('data.received');
				setTimeout(encodeAndSend(), 100);
			}
			else if (data.reset)
			{
				resetButton();
			}
			else if (data.downloadFinished)
			{
				if ($.cookie(roomname)) 
				{
					$.removeCookie(roomname);
				}
				console.log("Cookie removed. Log should say 'undefined' below...");
				console.log($.cookie(roomname));
			}
			else if (data.numWritten)
			{
				console.log(data.numWritten);
				chunksSent = data.numWritten;
				sliceEnd = chunkSize * data.numWritten;
				setTimeout(encodeAndSend(), 100);
			}
			else if (data.name)
			{
				console.log("flag2");
				//console.log(data);
				filename = data.name;
				filesize = data.size;
				filetype = data.type;
				numChunks = data.numChunks;
				var cookie_val = null;
				var cookieMatches;

				console.log(JSON.stringify({name : filename, size : filesize, type: filetype, numChunks: numChunks}));

				//fileInfo.text("Receiving " + filename);
				if ($.cookie(roomname))
				{
					console.log('we have a cookie here');
					cookie_val = $.cookie(roomname);
					// same file, so call resumeSend()
					if (filename == cookie_val.name &&
						filesize == cookie_val.size &&
						filetype == cookie_val.type &&
						numChunks == cookie_val.numChunks)
					{
						console.log('File metadata matches...');
						//$('#status').html("Click to resume receiving this file.");
						$('#receiveFile .wrapper').text("Resume file");
						cookieMatches = true;
					}
					//else
						//$('#status').html("Click to accept this file.");
				}
				//else
					//$('#status').html("Click to accept this file.");

				//fileInfo.html("File: " + filename + "<br>" + "Size: " + Math.round(filesize/1000000) + " MB" + "<br>" + "Estimated Time: " + Math.round(filesize/1500000) + " s");
				
				$('#filename .var').html(filename);
				$('#filesize .var').html(Math.round(filesize/1000));
				$('#time .var').html(Math.round(filesize/1500000));
				fileInfoWrapper.css('max-height', '500px');

				//console.log(fs);
				//console.log()
				//dc.send(JSON.stringify({received : true}));

				cancelButton.click(function()
				{
					dc.send(JSON.stringify({reset: true}));
					resetButton();
				});
				recModeButton();
				if (!choseAFile)
					moveButton();
				instructions.text('Your partner wants to send the following file. Click the button to accept it and start the transfer, or click the "Cancel" button to not accept it and go back to file selection.');
				$('.mask').unbind('click');
				$('.mask').addClass('clickable');
				$('.mask').click(function()
				{
					timer.start();
					instructions.text('The file transfer has started. The progress bar above shows how much has been received. The file will automatically be downloaded when the transfer is complete.');
					//$('#status').html("Receiving: ");
					hideCancelButton();
					$('.mask').unbind('click');
					$('.mask').removeClass('clickable');
					moveButton();
					isReceiving = true;

					var initFileSystem = function()
					{
						window.webkitStorageInfo.requestQuota(PERSISTENT, Math.round(filesize*1.1), function(grantedBytes)
						{
							window.requestFileSystem(PERSISTENT, grantedBytes, function(filesystem)
							{
								fs = filesystem;
								console.log("opened file system " + fs.name);

								fs.root.getFile(
									filename,
									{create: true},
									function(fileEntry)
									{
										fileEntry.createWriter(function(writer)
										{
											writer.onerror = errorHandler;/*function(){console.log("the File Entry Writer had an error");};*/
											writer.truncate(0);
											console.log('truncated');
											tempFileExists = true;
										});
									});

								// store metadata in a cookie (expires in 1 day)
								$.cookie.json = true;
								$.cookie(roomname,
									/*JSON.stringify(*/{
										name : filename,
										size : filesize,
										type: filetype,
										numChunks: numChunks,
										partner: partner
									}, { expires: 1 });
								setTimeout(function()
								{
									console.log($.cookie(roomname));
									dc.send(JSON.stringify({received : true}));
								}, 500);
							}, errorHandler)
						}, errorHandler);
					}

					// cookie exists, so could be reconnection attempt
					if ($.cookie(roomname))
					{
						if(cookieMatches)
						{
							if (cookie_val.numWritten)
							{
								//console.log('trying to write the part file to the fileEntry');

								console.log('Sending numWritten...');
								dc.send(JSON.stringify({ numWritten : cookie_val.numWritten }));
								cookie_val.partner = partner;
								chunksReceived = cookie_val.numWritten;
								console.log(chunksReceived);
								tempFileExists = true;
								console.log(tempFileExists);
								$.cookie.json = true;
								$.cookie(roomname, cookie_val, { expires: 1 });
							}
							else
								initFileSystem();
						}
						else
							initFileSystem();
					}
					else
					{
						initFileSystem();
					}
				});
			}
			// else if (data.resume) {
			// 	chunksSent = data.resume;
			// 	sliceEnd = chunksSent * chunkSize;
			// 	// setTimeout(encodeAndSend(), 100);
			// 	console.log('Resuming file transfer...');
			// }
		}
		catch(e)
		{
			//console.log(e);

			if (tempFileExists)
				options = {create : false};

			chunksReceived++;
			var fraction = (chunksReceived/numChunks);
			changeDial(fraction);
			$('#time .var').html(Math.round(timer.getSeconds()/fraction * (1-fraction)));

			var decoded = FileConverter.DataUrlToBlob(event.data);
			tempArray.push(decoded);

			// FILESYSTEM API
			var writeToFile = function()
			{
				//console.log("here!");
				fs.root.getFile(
					filename,
					options,
					function(fileEntry)
					{
						/* create a writer that can put data in the file */
						fileEntry.createWriter(function(writer)
						{
							writer.onerror = function(e){console.log("the File Entry Writer had an error" + e);};

							//var newBlob = FileConverter.DataUrlToBlob(event.data);

							if (!tempFileExists)
							{
								writer.seek(0);
								tempFileExists = true;
							}
							else
							{
								console.log(writer.length);
								writer.seek(writer.length);
							}

							var blob = new Blob(tempArray);
							try
							{
								writer.write(blob);
							}
							catch(e)
							{
								console.log(e);
								setTimeout(function (argument) {
									writer.write(blob);
								}, 1000);
							}
							tempArray = [];

							if (chunksReceived % 256 == 0) {
								//console.log("Chunk Received: " + chunksReceived);
								//console.log("numChunks = " + numChunks);
							}

							writer.onwriteend = function()
							{
								//console.log("Finished writing chunk");
								//if (chunksReceived <= chunksPerWrite)
								//	writer.truncate(chunkSize*chunksReceived);

								//console.log(writer.length);

								if (chunksReceived == numChunks)
								{
									console.log("last chunk received!");
									chunksReceived = 0;
									tempFileExists = false;
									isReceiving = false;
									downloadFile(fileEntry, filename, writer);
									//finishDial(filesize);
									removeFile(fileEntry, filesize);
									if($.cookie(roomname)) 
									{
										$.removeCookie(roomname);
										console.log("Cookie removed. Log should say 'undefined' below...");
										console.log($.cookie(roomname));
									}

									$('#receiving .wrapper').text("Received!");
									instructions.text('The file has been successfully received and downloaded!');
									setTimeout(resetButton, 1000);
									dc.send(JSON.stringify({ downloadFinished : true }));
									return;
								}
								if (isReceiving) 
								{
									$.cookie.json = true;
									cookie_val = $.cookie(roomname);
									var counter = 0;

									if ($.cookie(roomname) != null) 
									{
										cookie_val.numWritten = chunksReceived;
										console.log(cookie_val.numWritten);
										$.cookie(roomname, cookie_val, { expires: 1 });
										//console.log($.cookie(roomname));
									} 
									else 
									{
										$.cookie(roomname,
											{
												name : filename,
												size : filesize,
												type: filetype,
												numChunks: numChunks,
												partner: partner,
												numWritten: chunksReceived,
											}, { expires: 1 });
									}
									setTimeout(dc.send(JSON.stringify({received : true})), 500);
								}
							};
						});
					});
			};

			if (chunksReceived % chunksPerWrite == 0 || chunksReceived == numChunks)
			{
				//console.log('chunksReceived = ' + chunksReceived);
				//console.log('numChunks = ' + numChunks);
				//console.log(options);
				console.log(chunksReceived);
				writeToFile();
			}
		}
	}

	global_datachannel.onopen = function() {
		//$('#status').html("Ready to send!");
		console.log('datachannel opened');
		//status.hidden = true;
		//$('#status').hidden = true;
		moveButton();

		instructions.text('You\'re connected and ready to send a file! Click on the button to choose a file, or drag one onto the page.');

		inFileSelect = true;
		$('.mask').addClass('clickable');

/*		$('.clickable').hover(
			function()
			{
				console.log('hovering on clickable');
				$('.dial').trigger('configure', {"width":300});
				console.log($('.dial').attr('data-width'));
			},
			function()
			{
				$('.dial').trigger('configure', {"width":278});
				console.log($('.dial').attr('data-width'));
			});
*/

		$('.mask').click(function() {
			$('#files').click();
		});
		dc_opened_flag = true;

		if ($.cookie(roomname) != null)
		{
			console.log('we have a cookie!');
			instructions.text('We see that you were previously in the middle of sending a file. To resume sending, select the same file and confirm, and you\'ll start right where you left off.');
			if (instructions.css('min-height') == "0px")
				instructionButton.click();
		}
	}
	global_datachannel.onclose = function() {
		console.log('Datachannel closed');
		global_datachannel = null;
		dc_opened_flag = false;
	}
}

function downloadFile(fileEntry, filename, fileWriter)
{
	console.log(fileEntry);
	console.log(filename);

	if (!window.URL && !window.webkitURL)
		window.URL = window.webkitURL;
	var a = document.createElement('a');

	a.download = filename;
	//a.setAttribute('href', window.URL.createObjectURL(fileEntry));
	a.setAttribute('href', fileEntry.toURL());
	document.body.appendChild(a);
	a.onclick = function(e)
	{

	}
	a.click();

	//

	//blob = new Blob([]);
}

function removeFile(fileEntry, filesize)
{
	var baseWait = 500;
	var extraPer100MB = 150;
	var totalWait = baseWait + extraPer100MB*Math.ceil(filesize/100000);

	setTimeout(function()
	{
		fileEntry.remove(function() { console.log('File removed.'); }, errorHandler);
	}, totalWait);
}

function errorHandler(e) {
  var msg = '';

  switch (e.code) {
    case FileError.QUOTA_EXCEEDED_ERR:
      msg = 'QUOTA_EXCEEDED_ERR';
      break;
    case FileError.NOT_FOUND_ERR:
      msg = 'NOT_FOUND_ERR';
      break;
    case FileError.SECURITY_ERR:
      msg = 'SECURITY_ERR';
      break;
    case FileError.INVALID_MODIFICATION_ERR:
      msg = 'INVALID_MODIFICATION_ERR';
      break;
    case FileError.INVALID_STATE_ERR:
      msg = 'INVALID_STATE_ERR';
      break;
    default:
      msg = e.code;
      break;
  };

  console.log('Error: ' + msg);
}

// Note: need to figure out a way to transfer large files (bigger than memory). FileSystem API seems like the way to go.
function dataChannel() {
	if (global_datachannel == null) {
		console.log("Making data channel");
		var pc = peerConnection();

		global_datachannel = pc.createDataChannel("dataChannel", {
			reliable: true,
			ordered: true,
			maxRetransmitTime: 3000
		});

		setupGlobalDataChannel();
	}
	return global_datachannel;
}

var FileConverter = {
	DataUrlToBlob: function(dataURL) {
		var binary = atob(dataURL.substr(dataURL.indexOf(',') + 1));
		var array = [];
		for (var i = 0; i < binary.length; i++) {
			array.push(binary.charCodeAt(i));
		}

		var type;

		try {
			type = dataURL.substr(dataURL.indexOf(':') + 1).split(';')[0];
		} catch(e) {
			type = 'text/plain';
		}

		return new Blob([new Uint8Array(array)], { type: type });
	}
};

/* Stuff client does */

/*
 * It seem like sending ice candidates one-by-on only works in chrome. Firefox merges them all together.
 * See muaz khan's page on RTCPeerConnection for more info.
 */

function selectFile(file)
{
	console.log(file);
	var filename, filesize, filetype;

	filename = file.name;
	filesize = file.size;
	filetype = file.type;
	var totChunks = Math.ceil(filesize/chunkSize);
	//console.log("You got " + file + "name: " + filename + " of size " + file.size);
	//fileInfo.html("File: " + filename + "<br>" + "Size: " + Math.round(file.size/1000000) + " MB" + "<br>" + "Estimated Time: " + Math.round(file.size/1500000) + " s");
	//$('#status').html("Click to send this file.");

	$('#filename .var').html(filename);
	$('#filesize .var').html(Math.round(file.size/1000));
	$('#time .var').html(Math.round(file.size/1500000));

	instructions.text('If this is the file you want to send, click the button to start the transfer. Otherwise, click the "Cancel" button to choose another file.');

	if ($.cookie(roomname))
	{
		console.log('we see you have a cookie');
		var cookie_val = $.cookie(roomname);
		console.log(cookie_val);
		// same file, so call resumeSend()
		if (filename == cookie_val.name &&
			filesize == cookie_val.size &&
			filetype == cookie_val.type &&
			totChunks == cookie_val.numChunks)
		{
			$('#confirmFile .wrapper').text('Resume file');
			instructions.text('Just click the button to resume sending the file');
			//$('#status').html('Click to resume sending this file.')
		}
	}

	fileInfoWrapper.css('max-height', '500px');

	if (!choseAFile)
		moveButton();

	var dc = dataChannel();
	dc.send(JSON.stringify({fileChosen: true}));

	$('.mask').unbind('click');
	$('.mask').addClass('clickable');
	$('.mask').click(function() {
		//$('#status').html("Waiting for receiver to accept.");
		$('#sending .wrapper').text("Waiting...");
		instructions.text('We\'ve sent file data to your partner, and the transfer will start when your partner accepts the file.');

		$('.mask').unbind('click');
		$('.mask').removeClass('clickable');
		status[0].hidden = true;

		console.log('About to send file.');
		send(file);
		console.log('Sent metadata');
		moveButton();
		inFileSelect = false;
		hideCancelButton();
	});
	choseAFile = true;
}

function unselectFile(file)
{
	files = null;
	file = null;
	// filename = null;
	inFileSelect = true;
	choseAFile = false;
	//fileInfo.html("");
}

function handleFileSelect(evt) {
	file = evt.target.files[0];
	console.log(file);
	if (file != null)
		selectFile(file);
	$('#files').val("");
}

function sendOffer() {
	console.log("offer sent");
	var pc = peerConnection();
    pc.createOffer(function(offerSDP) {
        pc.setLocalDescription(offerSDP);
		$.post("/message", JSON.stringify({ // May have to JSON, encode, etc
			dest     : partner,
			offerSDP : offerSDP
		}));
    }/*, onfailure, sdpConstraints */);
}

 function sendAnswer() {
	console.log("answer sent")
	// For later, more dynamic solutions set pc onmessage. For now, we can just use GET.
	var pc = peerConnection();
	pc.createAnswer(function(answerSDP) {
		pc.setLocalDescription(answerSDP);
		$.post("/message", JSON.stringify({
			dest      : partner,
			answerSDP : answerSDP
		}));
	}/*, onfailure, sdpConstraints*/);
}

function lockFileSelect()
{
	isLockedOut = true;
	$('#fileSelecting .wrapper').innerHTML = '';
	$('#fileSelecting .wrapper').html('<p id="greenText">Please wait, partner is choosing a file...</p>');
	$('.mask').unbind('click');
	$('.mask').removeClass('clickable');

	//$('#fileSelecting').unbind('hover');
	//$('#fileSelecting').hover(function(){});
	$('#fileSelecting').removeClass('greenPulse');
	$('#fileSelecting').css('cursor', 'default');
	$('#fileSelecting p').css('cursor', 'default');

	instructions.text('Your partner is choosing a file right now. You will be able to choose a file once the transfer is complete or the file is not sent or accepted.');
}

function unlockFileSelect()
{
	isLockedOut = false;
	$('#fileSelecting .wrapper').html('<p id="greenText">Drag and Drop <hr /> Choose a file</p>');

	$('#fileSelecting').addClass('greenPulse');
	$('#fileSelecting').css('cursor', 'pointer');
	$('#fileSelecting p').css('cursor', 'pointer');

	$('.mask').unbind('click');
	$('.mask').addClass('clickable');
	$('.mask').click(function() {
		$('#files').click();
	});
	instructions.text('You\'re ready to send a file! Just click on the button to choose a file, or drag one onto the page.');
}

function encodeAndSend()
{
	var dc = dataChannel();
	$('#sending .wrapper').text("Sending...");
	//$('#status').html("Sending: ");

	var waitAndSend = function(time, data) {
		try {
			setTimeout(time, dc.send(data));
			return true;
		} catch (e) {
			return false;
		}
	}

	for (var i = 0; i < chunksPerWrite && !isFinished; i++)
	{
		//console.log(sliceEnd);
		var sendingData = nextChunk();
		var reader = new window.FileReader();

		var fraction = (chunksSent/totalChunks);
		changeDial(fraction);
		$('#time .var').html(Math.round(timer.getSeconds()/fraction * (1-fraction)));

		reader.readAsDataURL(sendingData);

		reader.onload = function(event) {
			var dataToSend = event.target.result;
			var time = 0;
			while(!waitAndSend(time, dataToSend)) {
				//console.log("failed send, sending again in " + time);
				if (time < 10000) {
					time = (time * 2) + 1;
				}
			}
		}
	}

	if (isFinished)
	{
		console.log('finished!');
		//finishDial(chunkSize * totalChunks);
		$('#sending .wrapper').text("Sent!");
		instructions.text('The file has been successfully sent!');
		setTimeout(resetButton, 500);
		isFinished = false;
		sliceStart = 0;
		sliceEnd = 0;
		chunksSent = 0;
		totalChunks = 0;

	 	return;
	}

}

function nextChunk()
{
	sliceStart = sliceEnd;

	var distRemaining = file.size - sliceStart;
	if (distRemaining <= chunkSize)
	{
		sliceEnd += distRemaining;

		isFinished = true;
		console.log('finished chunking');
	}
	else
		sliceEnd += chunkSize;

	//console.log("sliceEnd: " + sliceEnd);
	chunksSent++;
	//console.log("space left: " + (file.size - sliceStart));
	var fileslice = file.slice(sliceStart, sliceEnd);
	//console.log(fileslice);
	if (chunksSent % 100 == 0)
		console.log('Sent Chunk: ' + chunksSent + " out of " + totalChunks + " from byte: " + sliceStart);
	return fileslice;
}

function send(data)
{
	//var sendData = function() {
		//console.log(data);
		//var sendChannel = dataChannel();

		//encodeAndSend();

		//while(encodeAndSend());

		// if (isFinished)
		// {
		// 	console.log(isFinished);
		// 	dc.send(JSON.stringify({complete: true}));
		// 	isFinished = false;
		// }
		//encodeAndSend();
	//}

	var sendMetadata = function()
	{
		//metadata for the file
		var filename, filesize, filetype;

		filename = data.name;
		filesize = data.size;
		filetype = data.type;
		totalChunks = Math.ceil(filesize/chunkSize);

		// cookie exists, so could be reconnection attempt
		if ($.cookie(roomname))
		{
			var cookie_val = /*JSON.parse(*/$.cookie(roomname);
			// same file, so call resumeSend()
			if (filename == cookie_val.name &&
				filesize == cookie_val.size &&
				filetype == cookie_val.type &&
				totalChunks == cookie_val.numChunks)
			{
				console.log('resuming file');
			}
			// different file, so assume sender wants to abandon old transfer attempt
			else
			{
				// store metadata in a cookie (expires in 1 day)
				$.cookie.json = true;
				$.cookie(roomname,
					/*JSON.stringify(*/{
						name : filename,
						size : filesize,
						type: filetype,
						numChunks: totalChunks,
						partner: partner
					}, { expires: 1 });
			}
		}
		// no existing cookie, so cannot be reconnection
		else
		{
			console.log('no cookie found');
			// store metadata in a cookie (expires in 1 day)
			$.cookie.json = true;
			$.cookie(roomname,
				/*JSON.stringify(*/{
					name : filename,
					size : filesize,
					type: filetype,
					numChunks: totalChunks,
					partner: partner
				}, { expires: 1 });
		}
		console.log($.cookie(roomname));
		// send metadata through the datachannel
		dc.send(JSON.stringify({
			name : filename,
			size : filesize,
			type: filetype,
			numChunks: totalChunks
		}));
	}

	try {
		var dc = dataChannel();
	} catch (e) {
		alert('Failed to create data channel. ' + 'You need Chrome M25 or later with RtpDataChannel enabled');
		trace('createDataChannel() failed with exception: ' + e.message);
	}

	if (dc_opened_flag) {
		console.log("it's open!")
		sendMetadata();
		//sendData();
	} else {
		dc.onopen = sendMetadata;
	}
}

function moveButton() {
	var size = 280;
	var num = $('#content').css('margin-top');
	num = num.substring(0, num.length - 2);
	num = Math.floor((parseInt(num))/size) * size - size;
	$('#content').css('margin-top', num + 'px');
}

function moveButtonBack(){
	instructions.text('You\'re ready to send a file! Just click on the button to choose a file, or drag one onto the page.');
	var size = 280;
	var num = $('#content').css('margin-top');
	num = num.substring(0, num.length - 2);
	num = Math.floor((parseInt(num))/size) * size + size;
	$('#content').css('margin-top', num + 'px');
	unselectFile(file);
}

function resetButton() {
	unlockFileSelect();
	instructions.text('You\'re ready to send a file! Just click on the button to choose a file, or drag one onto the page.');
	var size = 280;
	$('#content').css('margin-top', size*(-1) + 'px');

	//$('#status').html("Ready to send!");
	$('#sending').removeClass('hidden');
	$('#confirmFile').removeClass('hidden');
	$('#sending .wrapper').text("Sending...");
	$('#receiving .wrapper').text("Receiving...");
	isSending = false;
	isReceiving = false;
	inFileSelect = true;
	choseAFile = false;

	changeDial(0);
	$('.mask').unbind('click');
	$('.mask').addClass('clickable');
	$('.mask').click(function() {
		$('#files').click();
	});

	//fileInfo.html("");
	fileInfoWrapper.css('max-height', 0);
	makeCancelButton();
	$('#link').click(function(event) {
		$(this).select();
	});
}

function cancelFile()
{
	var dc = dataChannel();
	moveButtonBack();
	dc.send(JSON.stringify({fileRemoved : true}));
	fileInfoWrapper.css('max-height', 0);
	$('.mask').unbind('click');
	$('.mask').addClass('clickable');
	$('.mask').click(function() {
		$('#files').click();
	});
}

function makeCancelButton()
{
	cancelButton.unbind('click');
	cancelButton.click(cancelFile);
	// cancelButton.html("&#10006;");
	cancelButton.css('font-style', 'italic');
	fakeCancelButton.html('font-style', 'italic');
	cancelButton.html('CANCEL');
	fakeCancelButton.html('CANCEL');
}

function hideCancelButton()
{
	cancelButton.click(function(){});
	cancelButton.html("");
	fakeCancelButton.html("");
}

function recModeButton() {
	$('#sending').addClass('hidden');
	$('#confirmFile').addClass('hidden');
}

function changeDial(fraction) {
	$('.dial').val(fraction * 10000).trigger('change');
	console.log('changing dial');
}

function finishDial(filesize) {
	var value = 9950;
	while (value < 10000) {
		value++;
		console.log(value);
		setTimeout(function() {
			$('.dial').val(value).trigger('change');
		}, 500);
	}
}

function Stopwatch() {
	var startTime, endTime, instance = this;

  	this.start = function () {
    	startTime = new Date().getTime();
  	};

  	this.getSeconds = function() {
    	if (!startTime){
    		return 0;
    	}
		endTime = new Date().getTime();
		return Math.round((endTime - startTime) / 1000);
  	}
	
	this.clear = function () {
    	startTime = null;
    	endTime = null;
  	}
}

function showInstructions()
{
	instructions.css('max-height', '300px');
	instructions.css('margin-top', '25px');
	instructions.css('font-style', 'italic');
	instructionButton.css('width', '70px');
	instructionButton.html('Got It!');
	instructionButton.unbind('click');
	instructionButton.click(hideInstructions);
}

function hideInstructions()
{
	instructions.css('max-height', 0);
	instructions.css('margin-top', '0px');
	instructionButton.css('width', '170px');
	// instructionButton.css('font-style', 'italic');
	// instructionButton.html('&#63;');
	instructionButton.html('Show Instructions');
	instructionButton.unbind('click');
	instructionButton.click(showInstructions);
}

$(document).ready(function() {
	timer = new Stopwatch();

	$(window).on('beforeunload', function () {
		if (isReceiving || isSending) {
			// setTimeout(function() {
			// 	setTimeout(function() {
			// 		dc = dataChannel();
			// 		dc.send(JSON.stringify({resume : chunksReceived}));
			// 		console.log('woohoo modals');
			// 	}, 1000);
			// }, 1);
			return 'Closing this window will cancel the download.';
		}
		else
			$.removeCookie(roomname);
	});

	cancelButton.click(cancelFile);

	instructionButton.click(showInstructions);
	instructions.text('Welcome to Chute! To get started with the file transfer, share the link above with a friend. The link has already been highlighted so it can be easily copied to the clipboard. When your friend goes to the link, we\'ll automatically connect you.');

	if (roomname) {
		$('#link').val(document.URL);
	}
	else {
		$('#link').val("Please Wait...")
	}

	$('#newroom').on('click', function() {
		roomname = "temp";
		$('#screenmessage').addClass('hidden');
		window.history.pushState({"pageTitle": "Chute " + roomname} ,"", "/c/" + roomname);
		$('#link').val(document.URL);
	});

	$('.dial').trigger('configure', {
		"fgColor":"#D660CE",
	});

	$('#link').click(function(event) {
		$(this).select();
	});

	/*$('#fileSelecting').hover(function()
		{
			$(this).stop(true).css('-webkit-animation-name', 'greenPulse');
 			$(this).stop(true).css('-webkit-animation-duration', '2s');
 		 	$(this).stop(true).css('-webkit-animation-iteration-count', 'infinite');
		}, function(){$(this).stop(true, true);});*/

	signalingServer();

	/*files.click(function()
		{
			files.replaceWith(files = files.clone(false, false));
			files.addEventListener('change', handleFileSelect, false);
		});*/
	$('#files').change(handleFileSelect);
});
