(function() {
	const uid = require("./uid.js"),
		isSoul = require("./is-soul.js"),
		secure = require("./secure.js");
	
	function Edge({db,parent,path=["","e"]}) {
		Object.defineProperty(this,"db",{enumerable:false,value:db});
		this.parent = parent;
		this.path = path;
	}
	Edge.prototype.add = async function(data,options) {
		let set = await this.db.getItem(this.path.join("!"));
		if(!set || !set.startsWith("MapSet@")) {
			set = `MapSet@${uid()}`;
			await this.value(set);
		}
		if(data && typeof(data)==="object") {
			let id = data["#"];
			if(!id) {
				id = data["#"] = `${data.constructor.name}@${uid()}`;
				await this.db.put(data,options);
			}
			await this.db.put({"#":set,id},options);
		} else {
			const key = JSON.stringify(data);
			await this.db.put({"#":set,[key]:data},options);
		}
		return this;
	}
	Edge.prototype.delete = async function() {
		const keys = await this.db.keys(this.path.join("!"));
		if(keys.length===0 || keys[0]==="") {
			return 0;
		}
		await this.db.removeItem(this.path.join("!"))
		return this.db.clear(this.path.join("!"));
	}
	Edge.prototype.get = async function(path) {
		const parts = Array.isArray(path) ? path : path.split(".");
		let node = this,
			part;
		path = this.path.slice();
		while(part = parts.shift()) {
			path.push(part);
			node = new Edge({db:this.db,parent:node,path:path.slice()});
		}
		return node;
	}
	Edge.prototype.put = async function(data,options={}) {
		let node = this,
			type = typeof(data);
		if(data && type==="object") {
			const id = data["#"];
			// when here?
			// transform here
			// validate here
			// secure here
			// on here
			if(id) { // if putting a first class object, reset to root
				const cname = id.split("@")[0];
				node = await (await this.db.get(`${cname}@`)).get(id);
			}
			for(const key in data) {
				const value = data[key];
				if(value && value["#"]) {
					await this.db.put(value,options.expireRelated ? options : {});
				} else {
					//if(value && typeof(value)==="object") {
					//	value["#"] = `${value.constructor.name}@${uid()}`
					//}
					const child = await node.get(key);
					await child.put(value,options);
				}
			}
		} else {
			this.value(data,options);
		}
		return data;
	}
	Edge.prototype.remove = async function(data) {
		const set = await this.db.getItem(this.path.join("!"));
		if(!set || !set.startsWith('MapSet@')) {
			return this;
		}
		let key;
		if(data && typeof(data)==="object") {
			key = data["#"];
		} else {
			key = JSON.stringify(data);
		}
		if(key) {
			const path = `!e!MapSet@!${set}!${key}`;
			await this.db.removeItem(path);
			await this.db.clear(path);
		}
		return this;
	}
	Edge.prototype.restore = async function(data) {
		if(typeof(data)!=="string") {
			//const path = this.path.slice();
			//path.shift(); // remove ""
			//if(path[0].endsWith("@")) {
			//	path.splice(1,1); // remove id;
			//}
			// security here using edge path
			return data;
		}
		if(data.startsWith("MapSet@")) {
			const path = `!e!MapSet@!${data}!`,
				keys = await this.db.keys(path),
				set = new Set();
			set["#"] = data;
			for(const key of keys) {
				const parts = key.split("!"),
					value = parts[parts.length-1];
				if(value && value!=="#") {
					if(isSoul(parts[0],false)) {
						set.add(await this.restore(value));
					} else {
						set.add(JSON.parse(value));
					}
				}
			}
			return set;
		}
		if(isSoul(data,false)) {
			const cname = data.split("@")[0],
				keys = await this.db.keys(`!e!${cname}@!${data}!`),
				object = {};
			for(const key of keys) {
				const parts = key.split("!"),
					value = await this.db.cache.get(key);
				let node = object;
				parts.shift(); // remove ""
				parts.splice(1,1); // remove id
				const vpath = parts.slice();
				parts.shift(); // remove class
				while(parts.length>1) { // walk down the object
					const property = parts.shift(),
					node = node[property];
				}
				node[parts[0]] = value;
			}
			return object;
		}
		return data;
	}
	Edge.prototype.value = async function(value,options={}) {
		const request = this.db.request,
			user = request.user,
			vpath = this.path.slice();
		vpath.splice(0,2);
		if(arguments.length>0) {
			// transform here
			// validate here
			// secure here
			const {data,removed} = await secure.call(this,{key:vpath,action:"write",data:value,request,user});
			if(data!==undefined) {
				return this.db.cache.put(this.path.join("!"),data,options)
			}
			return;
		}
		value = await this.restore(await this.db.cache.get(this.path.join("!")));
		const {data} = await secure.call(this,{key:vpath,action:"read",data:value,request,user});
		if(data===value) {
			return value;
		}
	}
	module.exports = Edge;
}).call(this)