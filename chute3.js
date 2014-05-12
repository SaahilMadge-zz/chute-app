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
var filename = null;
var iceArray = [];
var isReceiving = false;
var isSending = false;
var isWriting = false;
var inFileSelect = false;
var choseAFile = false;
var iceCandidateArray = [];
var fs = null;

/* Buttons */
var files = $('#files')[0];
var connButton = $('#connectButton')[0];
var status = $('p');
var fileInfo = $('#fileInfo');
var cancelButton = $('#fileclose');
var fileInfoWrapper = $('#fileInfoWrapper');

window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;

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
  	if (inFileSelect)
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
			$('#status').html('Partner is connecting');

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
			$('#pageTitle').html("Chute " + roomname);
			clientType = data.clientType;
			partner = data.partner;
			console.log('Client type ' + clientType);
			if (clientType == 1)
			{
				$('#status').html('Ready for partner to join');
				dataChannel();
			}
			else if (clientType == 2) {
				$.post("/message", JSON.stringify({
							dest      :	partner,
							partnerID : clientID
				}), function () { $('#status').html('Connecting to partner');});
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
			setupGlobalDataChannel()
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
				$('#status').html('Ready for partner to join');
				dataChannel();
				resetButton();

				var cookie_val = JSON.parse($.cookie('oh_yay_a_cookie'));

			/*	fs.root.getFile(
					cookie_val.name,
					options,
					function(fileEntry)
					{
						downloadFile(fileEntry, cookie_val.name+".part", null);
					});
			*/
				//moveButtonBack();
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
	var filename, filesize, filetype;
	var dc = dataChannel();
	var numChunks = -1;
	var chunksReceived = 0;
	//var tempBlob = new Blob([]);
	var tempArray = [];
	var writeSize = chunksPerWrite * chunkSize;
	var tempFileExists = false;



	global_datachannel.onmessage = function(event) {
		//console.log("Received data", event.data);
		//$('#receive')[0].innerHTML = event.data;
		try
		{
			var data = JSON.parse(event.data);
			//console.log("flag1");

			if (data.received)
			{
				console.log('data.received');
				setTimeout(encodeAndSend(), 100);
			}
			else if (data.reset)
			{
				resetButton();
			}
			else if (data.downloadFinished)
			{
				$.removeCookie('oh_yay_a_cookie', { expires: 1, path: '/c/' + roomname });
				console.log("Cookie removed. Log should say 'undefined' below...");
				console.log($.cookie('oh_yay_a_cookie'));
			}
			else if (data.numWritten)
			{
				console.log(data.numWritten);
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

				console.log(JSON.stringify({name : filename, size : filesize, type: filetype, numChunks: numChunks}));

				//fileInfo.text("Receiving " + filename);
				fileInfo.html("Receiving file: " + filename + "<br>" + "Size: " + Math.round(filesize/1000000) + " MB" + "<br>" + "Estimated Time: " + Math.round(filesize/1500000) + " s");
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
				$('.mask').unbind('click');
				$('.mask').addClass('clickable');
				$('.mask').click(function() 
				{
					hideCancelButton();
					$('.mask').unbind('click');
					$('.mask').removeClass('clickable');
					moveButton();
					isReceiving = true;

					//window.webkitStorageInfo.requestQuota(PERSISTENT, filesize, function(grantedBytes) {
					window.requestFileSystem(window.TEMPORARY, filesize, function(filesystem)
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

							// cookie exists, so could be reconnection attempt
							if ($.cookie('oh_yay_a_cookie'))
							{
								var cookie_val = /*$.parseJSON(*/$.cookie('oh_yay_a_cookie');
								// same file, so call resumeSend()
								if (filename == cookie_val.name &&
									filesize == cookie_val.size &&
									filetype == cookie_val.type &&
									numChunks == cookie_val.numChunks)
								{
									console.log('File metadata matches...');
									if (cookie_val.numWritten)
									{
										console.log('trying to write the part file to the fileEntry');
										
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
														writer.onerror = function(e){console.log('FileWriter error '+ e);};

														//var newBlob = FileConverter.DataUrlToBlob(event.data);

														writer.seek(0);

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

														if (chunksReceived % 250 == 0) {
															console.log("Chunk Received: " + chunksReceived);
															console.log("numChunks = " + numChunks);
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

																$.removeCookie('oh_yay_a_cookie', { expires: 1, path: '/c/' + roomname });
																console.log("Cookie removed. Log should say 'undefined' below...");
																console.log($.cookie('oh_yay_a_cookie'));

																$('#receiving .wrapper').text("Received!");
																setTimeout(resetButton, 1000);
																dc.send(JSON.stringify({ downloadFinished : true }));
																//writer.truncate(0);
															}
															if (isReceiving) {
																var cookie_val = /*$.parseJSON(*/$.cookie('oh_yay_a_cookie');
																cookie_val.numWritten = chunksReceived;
																$.cookie('oh_yay_a_cookie', cookie_val, { expires: 1, path: '/c/' + roomname });
																console.log($.cookie('oh_yay_a_cookie'));
																setTimeout(dc.send(JSON.stringify({received : true})), 500);
															}
														};
													});
												});
										};

										console.log('Sending numWritten...');
										dc.send(JSON.stringify({ numWritten : cookie_val.numWritten }));
										cookie_val.partner = partner;
										chunksReceived = cookie_val.numWritten;
										$.cookie('oh_yay_a_cookie', JSON.stringify(cookie_val), { expires: 1, path: '/c/' + roomname });
									}
								}
							}
							else
							{
								// store metadata in a cookie (expires in 1 day)
								$.cookie.json = true;
								$.cookie('oh_yay_a_cookie',
									/*JSON.stringify(*/{
										name : filename,
										size : filesize,
										type: filetype,
										numChunks: numChunks,
										partner: partner
									}, { expires: 1, path: '/c/' + roomname });
								console.log($.cookie('oh_yay_a_cookie'));
							}

							setTimeout(dc.send(JSON.stringify({received : true})), 200);
						}, errorHandler);
					//}, errorHandler);

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
							writer.onerror = function(){console.log("the File Entry Writer had an error");};

							//var newBlob = FileConverter.DataUrlToBlob(event.data);

							if (!tempFileExists)
							{
								writer.seek(0);
								tempFileExists = true;
							}
							else
							{
								writer.seek(chunksReceived * chunkSize);
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

							if (chunksReceived % 250 == 0) {
								console.log("Chunk Received: " + chunksReceived);
								console.log("numChunks = " + numChunks);
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

									$.removeCookie('oh_yay_a_cookie', { expires: 1, path: '/c/' + roomname });
									console.log("Cookie removed. Log should say 'undefined' below...");
									console.log($.cookie('oh_yay_a_cookie'));

									$('#receiving .wrapper').text("Received!");
									setTimeout(resetButton, 1000);
									dc.send(JSON.stringify({ downloadFinished : true }));
									//writer.truncate(0);
								}
								if (isReceiving) {
									var cookie_val = /*$.parseJSON(*/$.cookie('oh_yay_a_cookie');
									cookie_val.numWritten = chunksReceived;
									$.cookie('oh_yay_a_cookie', cookie_val, { expires: 1, path: '/c/' + roomname });
									console.log($.cookie('oh_yay_a_cookie'));
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
				writeToFile();
			}
		}
	}

	global_datachannel.onopen = function() {
		$('#status').html("Ready to send!");
		console.log('datachannel opened');
		//status.hidden = true;
		//$('#status').hidden = true;
		moveButton();
		inFileSelect = true;
		$('.mask').addClass('clickable');
		$('.mask').click(function() {
			$('#files').click();
		});
		dc_opened_flag = true;

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
	filename = file.name;
	//console.log("You got " + file + "name: " + filename + " of size " + file.size);
	fileInfo.html("File: " + filename + "<br>" + "Size: " + Math.round(file.size/1000000) + " MB" + "<br>" + "Estimated Time: " + Math.round(file.size/1500000) + " s");

	fileInfoWrapper.css('max-height', '500px');

	if (!choseAFile)
		moveButton();

	$('.mask').unbind('click');
	$('.mask').addClass('clickable');
	$('.mask').click(function() {
		$('.mask').unbind('click');
		$('.mask').removeClass('clickable');
		status[0].hidden = true;

		console.log('About to send file.');
		send(file);
		console.log('File sent.');
		isSending = true;
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
	filename = null;
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

var isFinished = false;
var sliceStart = 0;
var sliceEnd = 0;
var chunksSent = 0;
var totalChunks = 0;

var chunkSize = 16000;

function encodeAndSend()
{
	var dc = dataChannel();

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
		var sendingData = nextChunk();
		var reader = new window.FileReader();

		var fraction = (chunksSent/totalChunks);
		changeDial(fraction);

		reader.readAsDataURL(sendingData);

		reader.onload = function(event) {
			var dataToSend = event.target.result;
			var time = 0;
			while(!waitAndSend(time, dataToSend)) {
				console.log("failed send, sending again in " + time);
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
		var filename = data.name;
		var filesize = data.size;
		var filetype = data.type;
		totalChunks = Math.ceil(filesize/chunkSize);

		// cookie exists, so could be reconnection attempt
		if ($.cookie('oh_yay_a_cookie'))
		{
			var cookie_val = /*JSON.parse(*/$.cookie('oh_yay_a_cookie');
			// same file, so call resumeSend()
			if (filename == cookie_val.name &&
				filesize == cookie_val.size &&
				filetype == cookie_val.type &&
				totalChunks == cookie_val.numChunks)
			{
				resumeSend();
			}
			// different file, so assume sender wants to abandon old transfer attempt
			else
			{
				// store metadata in a cookie (expires in 1 day)
				$.cookie.json = true;
				$.cookie('oh_yay_a_cookie',
					/*JSON.stringify(*/{
						name : filename,
						size : filesize,
						type: filetype,
						numChunks: totalChunks,
						partner: partner
					}, { expires: 1, path: '/c/' + roomname });
			}
		}
		// no existing cookie, so cannot be reconnection
		else
		{
			// store metadata in a cookie (expires in 1 day)
			$.cookie.json = true;
			$.cookie('oh_yay_a_cookie',
				/*JSON.stringify(*/{
					name : filename,
					size : filesize,
					type: filetype,
					numChunks: totalChunks,
					partner: partner
				}, { expires: 1, path: '/c/' + roomname });
		}
		console.log($.cookie('oh_yay_a_cookie'));
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

function resumeSend() {

}

function moveButton() {
	var size = 280;
	var num = $('#content').css('margin-top');
	num = num.substring(0, num.length - 2);
	num = Math.floor((parseInt(num))/size) * size - size;
	$('#content').css('margin-top', num + 'px');
}

function moveButtonBack(){
	var size = 280;
	var num = $('#content').css('margin-top');
	num = num.substring(0, num.length - 2);
	num = Math.floor((parseInt(num))/size) * size + size;
	$('#content').css('margin-top', num + 'px');
	unselectFile(file);
}

function resetButton() {
	var size = 280;
	$('#content').css('margin-top', size*(-1) + 'px');

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
}

function makeCancelButton()
{
	cancelButton.click(function()
		{
			moveButtonBack();
			fileInfoWrapper.css('max-height', 0);
			$('.mask').unbind('click');
			$('.mask').addClass('clickable');
			$('.mask').click(function() {
				$('#files').click();
			});
		});
	cancelButton.html("&#10006;");
}

function hideCancelButton()
{
	cancelButton.click(function(){});
	cancelButton.html("");
}

function recModeButton() {
	$('#sending').addClass('hidden');
	$('#confirmFile').addClass('hidden');
}

function changeDial(fraction) {
	$('.dial').val(fraction * 10000).trigger('change');
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

$(document).ready(function() {
	if (navigator.appVersion.indexOf("Win")!=-1) {
		console.log("Windows");
	}
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
	});

	cancelButton.click(function()
		{
			moveButtonBack();
			fileInfoWrapper.css('max-height', 0);
			$('.mask').unbind('click');
			$('.mask').addClass('clickable');
			$('.mask').click(function() {
				$('#files').click();
			});
		});

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

	signalingServer();

	/*files.click(function()
		{
			files.replaceWith(files = files.clone(false, false));
			files.addEventListener('change', handleFileSelect, false);
		});*/
	$('#files').change(handleFileSelect);
});
