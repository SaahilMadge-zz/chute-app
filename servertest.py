import jinja2
import os
import webapp2
import urllib
import json
import logging
import uuid
import random
import string

from google.appengine.api import channel
from google.appengine.ext import ndb
from google.appengine.api import users

alreadyRequested = False
channeltoken = '1'

JINJA_ENVIRONMENT = jinja2.Environment(
    loader=jinja2.FileSystemLoader(os.path.dirname(__file__)),
    extensions=['jinja2.ext.autoescape'],
    autoescape=True)

class Rooms(ndb.Model):
	memb1 = ndb.StringProperty()
	memb2 = ndb.StringProperty()

class MainPage(webapp2.RequestHandler):
	def get(self):
		template = JINJA_ENVIRONMENT.get_template('mainpage.html')
		self.response.out.write(template.render())

class ChuteRoom(webapp2.RequestHandler):
	def get(self):
		# Respond with unique ID.
		# roomname = self.request.path[3:]
		clientID = str(uuid.uuid4())

		template_values = {'uuid' : clientID}

		template = JINJA_ENVIRONMENT.get_template('junk.html')
		self.response.write(template.render(template_values))

class SocketOpen(webapp2.RequestHandler):
	def post(self):
		data = json.loads(self.request.body)
		clientID = data.get('clientID')
		roomname = data.get('roomname')

		logging.info(roomname)

		def generateRoomname():
			return ''.join(random.choice('abcdefghjkmnpqrtuvwxyz2346789') for _ in range(5));

		if not roomname:
			roomname = generateRoomname()
			while(Rooms.get_by_id(roomname)):
				roomname = generateRoomname()

		logging.info(roomname)

		room = Rooms.get_by_id(roomname)
		if room:
			logging.info(room.memb1)
			logging.info(room.memb2)
			if room.memb2 and room.memb2 != '':
				self.response.write(json.dumps({'roomFull':True}))
				return
			elif room.memb1:
				clientType = 2
				partner = room.memb1
				room.memb2 = clientID
		else:
			clientType = 1
			partner = ''
			room = Rooms(id = roomname, memb1 = clientID)
		room.put()
		self.response.write(json.dumps({'clientType':clientType, 'partner':partner, 'roomname':roomname}))

class Javascript(webapp2.RequestHandler):
	def get(self):
		global channeltoken
		clientID = self.request.get('uuid')
		roomname = self.request.get('roomname')

		token = channel.create_channel(clientID)
		template_values = {'token': token, 'uuid' : clientID, 'roomname' : roomname}
		template = JINJA_ENVIRONMENT.get_template('chute.js')
		self.response.out.write(template.render(template_values))

class Reset(webapp2.RequestHandler):
	def get(self):
		global channeltoken
		global alreadyRequested
		alreadyRequested = False
		channeltoken = '1'
		self.response.out.write('reset')


class Forward(webapp2.RequestHandler):
	def post(self):
		data = json.loads(self.request.body)
		#logging.info(self.request.body)
		#logging.info("Data: " + str(data))

		#if data.get('candidate'):
		#	logging.info('ICE candidate')

		channel.send_message(data.get('dest'), self.request.body);

class ChannelDisconnection(webapp2.RequestHandler):
	def post(self):
		client_id = self.request.get('from')
		qry = Rooms.query(ndb.OR(Rooms.memb1 == client_id, Rooms.memb2 == client_id))
		room = qry.get()
		if room:
			leftovers = room.memb1 if room.memb2 == client_id else room.memb2
			if room.memb2 == '' or room.memb2 == None:
				room.key.delete()
				logging.info("Removed room")
			else:
				channel.send_message(leftovers, json.dumps({'dest':leftovers, 'dead':True}))
				room.memb1 = leftovers
				room.memb2 = ''
				room.put()

class FAQ(webapp2.RequestHandler):
	def get(self):
		template = JINJA_ENVIRONMENT.get_template('faq.html')
		self.response.out.write(template.render())

#jinja_environment = jinja2.Environment( loader=jinja2.FileSystemLoader(os.path.dirname(__file__)))
app = webapp2.WSGIApplication([('/', ChuteRoom), ('/c/\w*', ChuteRoom), ('/js/chute.js', Javascript),('/opened', SocketOpen), ('/reset', Reset), ('/message', Forward), ('/_ah/channel/disconnected/', ChannelDisconnection), ('/faq', FAQ)], debug=True)
