var session = require('cookie-session');
var express = require('express');
var app = express();
var qs = require('querystring');
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');
var mongourl = 'mongodb://localhost:27017/test';
var fs = require('fs');
var formidable = require('formidable');
var url = require('url');
var ObjectID = require('mongodb').ObjectID;
app.set('view engine', 'ejs');
app.use(session({
	name: 'session',
	keys: ['key1','key2']
}));
app.use(express.static(__dirname +  '/public'));


app.get("/", function(req,res) {
	var lat  = req.query.lat;
	var lon  = req.query.lon;
	var zoom = req.query.zoom;
	if(req.session.username==null){
		res.render("login.ejs");
	}else{
		MongoClient.connect(mongourl,function(err,db){
			assert.equal(null,err);
			var restaurants = [];
			cursor = db.collection('restaurants').find();
			cursor.each(function(err, doc) {
				assert.equal(null,err);
				if (doc != null) {
					restaurants.push(doc);
				} else {
					res.render("index.ejs", {"user" : req.session,"restaurants":restaurants});
					res.end();
					db.close();
				}  
			});
		});
	}
});

app.post("/login", function(req,res) {
	var data = '';
	var post;
	req.on('data', function(chunk) {
		data += chunk;
	});
	req.on('end', function() {
		post = qs.parse(data);
	});

	MongoClient.connect(mongourl,function(err,db){
	
		db.collection('user').findOne({username:post.username,password:post.password}, function(err, user) {
			if(user!=null){
				req.session.authenticated = true;
				req.session.username = user.username;
				res.redirect('./');
			}else{
				res.render("notfound.ejs");
			}
		});	
	
	});

});
app.get("/logout", function(req,res) {
	req.session=null;
	res.render("login.ejs");
});
app.get("/new",function(req,res){
	if(req.session.username==null){
		res.render("login.ejs");
	}else{
		res.render("new.ejs");
	}
});
app.post("/newrest",function(req,res){
	if(req.session.username==null){
		res.render("login.ejs");
	}else{ 		
		var form = new formidable.IncomingForm();
		form.parse(req, function(err, fields, files){
			
			var phototype=files.photo.name.split(".")[1];			
			MongoClient.connect(mongourl,function(err,db){
				db.collection('restaurants').insert({name:fields.name,cuisine:fields.cuisine,street:fields.street,building:fields.building,zipcode:fields.zipcode,lon:fields.lon,lat:fields.lat,img:null,createby:req.session.username}, function(err, result) {
					
					var tmpPath = String(files.photo.path);
					var targetPath = String('./public/' + result.ops[0]._id+'.'+phototype);
					fs.renameSync(tmpPath, targetPath);
					res.redirect('./');
					db.collection('restaurants').update({_id:result.ops[0]._id},{$set:{img:result.ops[0]._id+'.'+phototype}});
				});	
		
	
			});
		});

		
	}
});
app.get("/register",function(req,res){
	res.render("register.ejs");
});
app.get("/rate",function(req,res){
	var parsedURL = url.parse(req.url,true); 
	var queryAsObject = parsedURL.query;
	MongoClient.connect(mongourl,function(err,db){
		db.collection('restaurants').findOne({_id:ObjectID(queryAsObject.id)},{rate:{ $elemMatch: {by:req.session.username}}},function(err, data) {
			
			if(data.rate==null){
				res.render("rate.ejs",{id:queryAsObject.id});
			}else{
				res.render("rated.ejs",{id:queryAsObject.id});
			}
		});
	});

});
app.post("/raterestaurant",function(req,res){
	var form = new formidable.IncomingForm();
	form.parse(req, function(err, fields, files){
		MongoClient.connect(mongourl,function(err,db){
			db.collection('restaurants').update({_id:ObjectID(fields.id)},{ $push: { rate: {score:fields.score,by:req.session.username }} }, function(err, result) {
				res.redirect('./');			
			});		
		});
	});
});
app.post("/createuser",function(req,res){
	var form = new formidable.IncomingForm();
	form.parse(req, function(err, fields, files){
		
		if(fields.password==fields.conformpassword){
			MongoClient.connect(mongourl,function(err,db){
				db.collection('user').insert({username:fields.username,password:fields.password}, function(err, user) {
					req.session.authenticated = true;
					req.session.username = fields.username;
					res.redirect('./');			
				});	
	
			});
		}else{
			res.redirect('./register');

		}	
	});
	
});
app.get("/showdetail",function(req,res){
	var parsedURL = url.parse(req.url,true); 
	var queryAsObject = parsedURL.query;
	if(queryAsObject.id!=null){
		MongoClient.connect(mongourl,function(err,db){
			db.collection('restaurants').findOne({'_id':ObjectID(queryAsObject.id)}, function(err, restaurant) {
				res.render("restaurantdetail.ejs", {"restaurant":restaurant,"imgsrc":restaurant.img});		
			});	
		});
	}
});
app.get("/edit",function(req,res){
	if(req.session.username==null){
		res.render("login.ejs");
	}else{
		var parsedURL = url.parse(req.url,true); 
		var queryAsObject = parsedURL.query;
		MongoClient.connect(mongourl,function(err,db){
			db.collection('restaurants').findOne({_id:ObjectID(queryAsObject.id)}, function(err, restaurant) {
				if(restaurant.createby==req.session.username)	{
					res.render("editrestaurant.ejs",{restaurant:restaurant});				
				}else{
					res.render("donothavepermission.ejs",{id:restaurant._id});
				}	
			});	

		});
	}
});
app.post("/editrest",function(req,res){
	var form = new formidable.IncomingForm();
	form.parse(req, function(err, fields, files){
		MongoClient.connect(mongourl,function(err,db){
			db.collection('restaurants').update({'_id':ObjectID(fields.id)},{$set:{name:fields.name,cuisine:fields.cuisine,street:fields.street,building:fields.building,zipcode:fields.zipcode,lon:fields.lon,lat:fields.lat}}, function(err, restaurant) {
				if(files!=null){
					var phototype=files.photo.name.split(".")[1]
					var tmpPath = String(files.photo.path);
					var targetPath = String('./public/' + fields.id+'.'+phototype);
					fs.renameSync(tmpPath, targetPath);
				}
				res.redirect('./showdetail?id='+fields.id);		
			});	
		});
	});
});
app.get("/delete",function(req,res){
	if(req.session.username==null){
		res.render("login.ejs");
	}else{
		var parsedURL = url.parse(req.url,true); 
		var queryAsObject = parsedURL.query;
		MongoClient.connect(mongourl,function(err,db){
			db.collection('restaurants').findOne({_id:ObjectID(queryAsObject.id)}, function(err, restaurant) {
				if(restaurant.createby==req.session.username)	{
					db.collection('restaurants').remove({_id:ObjectID(queryAsObject.id)});	
					res.redirect('./');		
				}else{
					res.render("donothavepermission.ejs",{id:restaurant._id});
				}	
			});	

		});
	}
});
app.listen(process.env.PORT || 8099);
