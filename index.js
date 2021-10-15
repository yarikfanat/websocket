var connections=[];

const PORT = process.env.PORT || 8080
const WebSocket = require('ws');
const wsServer = new WebSocket.Server({port: PORT});

console.log("Server listening on port 8080..");


function noop() {}

wsServer.on('close', ()=> {
  clearInterval(checkAlive);
});

const checkAlive = setInterval (()=> {
	var d = new Date();
	var date = d.toLocaleDateString()+' '+d.toLocaleTimeString();

	for (var j = 0; j < connections.length; j++) {
		if (connections[j].ws.isAlive==true)
		{
			console.log (date,' checkAlive()=> соединение живое :Клиент ',connections[j].user_name);
			connections[j].ws.isAlive=false;

			console.log ('Отправляю ping соединению');
			connections[j].ws.send (JSON.stringify({type:'ping_'}))
    //		connections[j].ws.ping(noop);
		}else
		{
			console.log (date,' checkAlive()=> соединение умерло :Клиент ',connections[j].user_name);
			connections[j].ws.terminate();		
		}
	};
},15000);

wsServer.on('connection', (ws,req)=> {

  var user_name;
  var client = {
	user_name:null,
	ws:ws,
	ip:req.socket.remoteAddress,
	func:null
  };
/*
  ws.on('pong',()=> {
  	console.log ('Получен pong от клиента (клиент жив)');
  	ws.isAlive = true;
  });
*/
  ws.on('message', (message)=> {
  	var data = JSON.parse(message);

  	switch (data.type)
  	{
  		case 'connect_user':
  			user_name = client.user_name = data.user_name;
  			client.func = data.func;
  			ws.isAlive = true;
  			connections.push (client);
		  	console.log ("Установлено новое соединение с ",user_name);
  			if (client.func.indexOf ('client')!=-1)
  			{
  				MakeUserList_p2p (ws);
  			}else
  			{
  				MakeUserListForTrainer (ws);
  			}		  	
  		break;
  		case 'message_touser':
  			SendToUser (data.target,data.text,data.from_user);
  		break;
  		case 'broadcast':
  			SendToAll (data.text,data.from_user);
  		break;
  		case 'broadcast-1':
  			SendToAllExclude (data.text,data.from_user,ws);  			
  		break;		 
  		case "new-ice-candidate":
  		case "video-answer":
  		case "video-offer":
  		case 'hang-up':
  		case 'hang-up-on':
  		case 'hang-up-off':
  			SendToUserRtc (data);
  		break;
  		case 'pong_':
  		    ws.isAlive = true;
  		break;
  		case 'pong':
  		//	ws.isAlive = true;
  			ws.send (JSON.stringify({type:'ping'}));
  		break;
  	}
  	
  });

  ws.on('close', ()=> {
    var i = connections.findIndex ( (client)=> {return client.user_name==user_name;});
  	if (i !=-1)
  	{
  	 	connections.splice(i, 1);
  		console.log ("Закрыто соединение с ",user_name);
  		MakeUserList_p2p (null);//для тренера отправить список клиентов
  		RefreshClientsList ();//для клиентов , если тренер покинул чат
  	}
  });

});


function SendToUserRtc(msg) {
	console.log ('rtcmsg ', msg.type,' для ',msg.target);
	var client = connections.find ((client)=> {return client.user_name==msg.target;});
	if (client != undefined)
	{
		client.ws.send (JSON.stringify(msg));
		console.log ("Передано rtc сообщение '"+JSON.stringify(msg)+"' клиенту ",msg.target+" от "+msg.from_user);
	}
}

function SendToUser(user_name,message,from_user) {
	var msg = {
		type: "message",
		text: message,
		date: null,
		from_user:from_user
	};
	var d = new Date();
	msg.date = d.toLocaleDateString()+' '+d.toLocaleTimeString();
	var client = connections.find ((client)=> {return client.user_name==user_name;});
	if (client != undefined)
	{
		client.ws.send (JSON.stringify(msg));
		console.log ("Передано сообщение '"+msg.text+"' клиенту ",user_name+" от "+from_user);
	}
}

function SendToAll(message,from_user) {
	var msg = {
		type: "message",
		text: message,
		date: null,
		from_user:from_user
	};
	var d = new Date();
	msg.date = d.toLocaleDateString()+' '+d.toLocaleTimeString();

	wsServer.clients.forEach((client)=> {
		if (client.readyState === WebSocket.OPEN) {
			client.send(JSON.stringify(msg));
		}
    });
}

function SendToAllExclude(message,from_user,ws) {
	var msg = {
		type: "message",
		text: message,
		date: null,
		from_user:from_user
	};
	var d = new Date();
	msg.date = d.toLocaleDateString()+' '+d.toLocaleTimeString();

	wsServer.clients.forEach((client)=> {
		if (client !== ws && client.readyState === WebSocket.OPEN) {
			client.send(JSON.stringify(msg));
		}
    });

}

function RefreshClientsList () {
	var msg = {
		type: "user_list",
		list: []
	};
	var i = connections.findIndex ( (client)=> {return client.func.indexOf ('trainer')!=-1;});
	if (i==-1)
	{
		wsServer.clients.forEach((client)=> {
			if (client.readyState === WebSocket.OPEN) {
				client.send(JSON.stringify(msg));//каждому клиенту отправить пустой список
				console.log ('клиенту отправлен пустой список:',JSON.stringify(msg));
			}
    	});
	}
}

function MakeUserList_p2p(ws) {
	var msg = {
		type: "user_list",
		list: []
	};

	var i = connections.findIndex ( (client)=> {return client.func.indexOf ('trainer')!=-1;});
	if (i!=-1)
	{
		if (ws)
		{
			msg.list.push (connections[i].user_name);
			ws.send(JSON.stringify(msg));//новому клиенту отправить имя тренера
			console.log ('клиенту отправлено имя тренера->',connections[i].user_name);
			msg.list.pop ();
		}		
		for (var j = 0; j < connections.length; j++) {
			if (i!=j)
			{
				msg.list.push (connections[j].user_name);
			}
		}
		connections[i].ws.send (JSON.stringify(msg));//тренеру отправить список всех клиентов
		console.log ('тренеру отправлено сообщение:',JSON.stringify(msg));
	}
}

function MakeUserListForTrainer (ws) {
	var trainer_name="";
	var msg = {
		type: "user_list",
		list: []
	};


	for (var j = 0; j < connections.length; j++) {
		if (connections[j].func.indexOf ('trainer')==-1)
		{
			msg.list.push (connections[j].user_name);
		}else
			trainer_name = connections[j].user_name;
	}
	if (msg.list.length > 0)		
		ws.send (JSON.stringify(msg));//тренеру отправить список всех клиентов
	while (msg.list.length > 0)
	{
		msg.list.pop ();
	}
	msg.list.push (trainer_name);

	wsServer.clients.forEach((client)=> {
		if (client !== ws && client.readyState === WebSocket.OPEN) {
			client.send(JSON.stringify(msg));//каждому клиенту отправить имя тренера
		}
    });
}