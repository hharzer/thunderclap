<a name="top"></a>
# thunderclap

Thunderclap is an indexed key-value and JSON database plus function oriented server designed specifically for Cloudflare. It runs on top of the
Cloudflare KV store. Its [query capability](#joqular) is supported by [JOQULAR](https://medium.com/@anywhichway/joqular-high-powered-javascript-pattern-matching-273a0d77eab5) 
(JavaScript Object Query Language), which is similar to, but more extensive than, the query language associated with MongoDB. 
In addition to having more predicates than MongoDB, JOQULAR extends pattern matching to object properties, e.g.

```javascript
// match all objects with properties starting with the letter "a" containing the value 1
db.query({[/a.*/]:{$eq: 1}}) 
```

Thunderclap uses a [JavaScript client](#javascript) client to support:

1) [Special storage for Infinity, NaN, Dates](#special-storage)

2) [Built in User, Position, and Coordinate Classes](#built-in-classes)

3) [role based access control mechanisms](#access-control)

4) [inline analytics and hooks](#analytics)

5) [triggers](#triggers)

6) [custom functions (with access control)](#functions)

7) [full text indexing and search](#full-text) in addition to [regular property indexing](#indexing)

8) [schema or schemaless operation](#schema)

9) [an admin UI](#admin)

A [URL fetch (CURL)](#curl) capability is alos supported.

Like MongoDB, Thunderclap is open-sourced under the Server Side Public License. This means licencees are free to use and 
modify the code for internal applications or public applications that are not primarily a means of providing Thunderclap
as a hosted service. In order to provide Thunderclap as a hosted service you must either secure a commercial license from 
AnyWhichWay or make all your source code available, including the source of non-derivative works that support the 
monitoring and operation of Thunderclap as a service.

# Important Notes

Thunderclap is currently in ALPHA because:

1) Workers KV from Cloudflare recently came out of beta and is missing a few key features that are "patched" by 
Thunderclap.

2) Security measures are incomplete and have not yet been vetted by a third party

3) Although there are many unit tests, application level functional testing has been limited

4) The source code could do with a lot more comments

5) Project structure does not currently have a clean separation between what people might want to change
for their own use vs submit as a pull request. In general, changes to file in the `src` directory are
candidates for pull requests and with the exception of this README those outside are not.

6) It has not been performance tuned.

7) It is highly likely you will need to re-create your NAMESPACES with every new ALPHA release.

8) It could do with contributors!

# Installation and Deployment

Clone the repository https://www.github.com/anywhichway/thunderclap.

Run `npm install`.

## Production

NOTE: While the software is in ALPHA state, you should probably not deploy to a production Cloudflare server that
is not behind Cloudflare's paid Access management interface.

When Thunderclap is running in production, it will be available at `thunderclap.<your-domain>`. When it is running in 
[development mode](#development), it will be available at `<dev-host-prefix>-thunderclap.<your-domain>`.

You can deploy and use Thunderclap immediately after creating and populating a `thunderclap.json` configuration file,
creating a KV namespace, and establishing a CNAME alias `thunderclap` in the Cloudflare DNS control panel. This can 
just point to your root, you do not need a distinct IP address, Cloudflare's smart routers will send requests to the Thunderclap workers.

Create a Cloudflare Workers KV namespace using the Cloudflare Workers control panel. By convention the following 
name form is recommended so that the name parallels the name of thw worker script generated by Thunderclap.

`thunderclap-<primaryHostName>-<com|org|...>`

e.g. `thunderclap-mydomain-com` is the KV namespace and script name associated with `thunderclap.mydomain.com`

You will need to populate a file `thunderclap.json` with many of your Cloudflare ids or keys. Copy the file 
`thunderclap.template.json` to `thunderclap.json` and replace the placeholder values. This will contain secret keys,
so you may want to move it out of your project directory to avoid having it checked-in. The `thunderclap` script in
`webpack.config.js` assumes the file is up one level in the directory tree. If you do leave it in the project
directory it will still be found, but .gitignore is configured to not check it in. .gitignore is also set to ignore 
`dbo.js`, which contains the default `dbo` password and `keys.js` which contains a function definition for iterating
over keys on the server that requires special credentials. None of this data is built into the browser software.

You will need to edit `webpack.config.js` if you wish to put `thunderclap.json` elsewhere or load keys from 
environment variables.

You will need to place the file `db.json` at the root of your web server's public directory and `thunderclap.js` 
in your normal JavaScript resources directory. For convenience, `db.json` and `thunderclap.js` are located in the `docs` 
subdirectory of the repository so you can host them using GitHub Pages if you wish.

You can use Thunderclap without making any modifications by setting the `mode` in `thunderclap.json` to `production`
and running `npm run thunderclap`. This will deploy the Thunderclap worker and a route.

See the files in `docs` and `docs/test` for examples of using Thunderclap.

<a name="javascript"></a>
# Data Manipulation [top](#top)

Data in Thunderclap can be manipulated using a JavaScript client or CURL.

Unlike most JSON data stores, Thuderclap supports the storage of Infinity, -Infinity, and NaN. Dates are automatically 
serialized and de-serialized.

## JavaScript Client [top](#top)

```javascript
<script src="thunderclap.js"></script>
<script>
const endpoint = "https://thunderclap.mydomain.com/db.json",
	username = "<get from somewhere>",
	password = "<get from somewhere>",
	db = new Thunderclap({endpoint,user:{username,password}});
</script>
```

`undefined async clear(string prefix="")` - Deletes items whose keys start with `prefix`. By default it can only be 
called by a user with the `dbo` role.

`string async changePassword(string userName,string password,string oldPassword)` - Changes the password from
`oldPassword` to `password` for the user with name `userName` and old password `oldPassword`. If `password` is not 
provided, a random 10 character password is generated. If the currently authenticated user has the role `dbo` and 
is not the user for whom the password wis being changed, `oldPassword` can be omitted.

`User async createUser(string userName,string password,reAuth)` - creates a user. The password is stored on the server
as an SHA-256 hash and salt. `createUser` can be called even if Thunderclap is started without a username and password. 
If this is done and `createUser` succeeds, the Thunderclap instance is bound to the new user for immediate authenticated 
use. If `reAuth` is truthy, the Thunderclap instance will also be re-bound to the new user. You can implement access 
control and account creation logic on the server to prevent the creation of un-authorized accounts. See the section 
Security.

`Array async entries(string prefix="",{number batchSize,string cursor})` - Returns an array or arrays for keys,
values and optionally expirations of data with keys that start with `prefix`., e.g. `entries("Person@")` might return:

```javascript
[["Person@jxmc9cc1kswqak4ga",{"name":"joe"},1562147669820],["Person@jxmcnqkx9irjhrz4p",{"name":"joe"}]]
```

It can be used in a loop just like `keys` below.

`any async getItem(string key)` - Gets the value at `key`. Returns `undefined` if no value exists.

`boolean async hasKey(string key)` - Returns `true` is `key` exists.

`Array async keys(prefix="",{number batchSize,string cursor,boolean expanded})` - Returns an Array of the next `batchSize`
keys in database than match the `prefix` every time it is called. By default it can only be called by a user with the 
`dbo` role. You can use a loop to process all keys:

```javascript
	let cursor;
	do {
		keys = await mythunder.keys("",{cursor});
		cursor = keys.pop();
		keys.forEach((key) => dosomething(key));
	} while(cursor && keys.length>0)
```

`any async putItem(object value,options={})` - Adds a unique id on property "#" if one does not exist, indexes the object and 
stores it with `setItem` using the id as the key. In most cases the unique id will be of the form 
`<className>@xxxxxxxxxxxxx`.Options can one of: `{expiration: secondsSinceEpoch}` or `{expirationTtl: secondsFromNow}`.

`boolean async removeItem(string|object keyOrObject) - Removes the keyOrObject. If the argument is an indexed object 
or a key that resolves to an indexed object, the key and data are removed from the database so long as the user has 
the appropriate privileges. If the key exists but can't be removed the function returns `false`. If the key does not exist
or removal succeeds, the function returns `true`. If `await` is true the server will bypass internal caches await the 
underlying data store.

`any async setItem(string key,any value,options={})` - Sets the `key` to `value`. If the `value` is an object it is 
NOT indexed. Options can one of: `{expiration: secondsSinceEpoch}` or `{expirationTtl: secondsFromNow}`.
If `await` is true the server will bypass internal caches await the underlying data store.

`Array async query(object JOQULARPattern)` - query the database using `JOQULARPattern`. See [JOQULAR](#joqular) below.

`Array async values(string prefix="",{number batchSize,string cursor})` - Returns all the data associated with keys that
start with `prefix`. By default it can only be called by a user with the `dbo` role. It can be used in a loop just like `keys` above.

<a name="curl"></a>
## CURL Requests [top](#top)

To be written

<a name="special-storage"></a>
# Special Storage [top](#top)

Most JavaScript document stores do not support special values like `undefined`, `Infinity` and `NaN`. Thunderclap 
serializes these as special strings, e.g. `@Infinity`. However, this is transparent to API calls via the JavaScript
client and should only be of concern to those who are customizing or extending Thuderclap.

The Thunderclap client also serializes dates as `Date@<timestamp>` and restores them to full-fledged dates after
transport.

The same is done for

<a name="built-in-classes"></a>
# Built-in Classes [top](#top)

## User [top](#top)

Thunderclap provides a basic `User` class accessable via `new Thunderclap.User({string userName,object roles={user:true}})`.
Developers are free to add other properties and values to the constructor argument. Additional role keys may also
be added to the roles sub-object. The only built-in roles are `user` and `dbo`. See Access Control(#access-control)
for more detail.

## Coordinates [top](#top)

For convenience, Thunderclap exposes a Coordinates object with the same properties as the [JavaScript browser standard
interface](https://developer.mozilla.org/en-US/docs/Web/API/Coordinates) `{latitude,longitude,altitude,accuracy,altitudeAccuracy,heading,speed}`. Coordinates can be created directly with:

```javascript
new Thunderclap.Coordinates({Coordinates coords,number timestamp});
```

There is also an asynchronous `Thunderclap.Coordinates.create([Coordinates coords])`. If the
optional argument is not provided, then the browser `navigator.geolocation.getCurrentPosition` will be called
to get the values to create the Coordinates.

## Position [top](#top)

For convenience, Thunderclap exposes a Position object with the same properties as the [JavaScript browser standard
interface](https://developer.mozilla.org/en-US/docs/Web/API/Position) `coords` and `timestamp`. Positions can be created 
directly with:

```javascript
new Thunderclap.Position({Coordinates coords,number timestamp});
```

There is also an asynchronous `Thunderclap.Position.create([{Coordinates coords,number timestamp}])`. If the
optional argument is not provided, then the browser 
[navigator.geolocation.getCurrentPosition](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition) 
will be called to get the values to create the Position.

<a name="joqular"></a>
# JOQULAR [top](#top)

Thunderclap supports a subset of JOQULAR. It is simlar to the MongoDB query language but more extensive. You can see many
examples in the unit test file `test/index.js`. 

Here is a basic query that returns everyone of age 21 or greater in zipcode 98101:

```javascript
const db = new Thunderclap({endpoint,user:{username:"<username>",password:"<password>"}}),
	results = await db.query({age:{$gte: 21},address:{zipcode:98101}}),
```

Thuderclap also suppport pattern marching on property names:

```javascript
db.query({[/a.*/]:{$eq: 1}}) // match all objects with properties starting with the letter "a" containing the value 1
```

The supported patterns are described below. All examples assume these two objects exist in the database:

```javascript
const o1 = {
		#:"User@jxxtlym2fxbmg0pno",
		userName:"joe",
		age:21,
		email: "joe@somewhere.com",
		SSN: "555-55-5555",
		registeredIP: "127.0.0.1",
		address:{city:"Seattle",zipcode:"98101"},
		registered:"Tue, 15 Jan 2019 05:00:00 GMT",
		favoritePhrase:"to be or not to be, that is the question"
	},
	o2 = {
		#:"User@jxxviym2fxbmg0pcr",
		userName:"mary",
		age:20,
		address:{city:"Bainbridge Island",zipcode:"98110"},
		registered:"Tue, 15 Jan 2019 10:00:00 GMT",
		favoritePhrase:"premum non nocere"
	};

```

The supported patterns include the below. (If a pattern is not documented, it may not have been tested yet. See the
unit test file `docs/test/index.js` to confirm.):

## Math and String Comparisons [top](#top)

`$lt` - A property is less than the one provided, e.g. `{age:{$lt:21}}` matches o2.

`$lte` - A value in a property is less or equal the one provided, e.g. `{age:{$lte:21}}` matches o1 and o2.

`$eq` - A value in a property is relaxed equal the one provided, e.g. `{age:{$eq:21}}` and `{age:{$eq:"21"}}` match o1.

`$eeq` - A value in a property is exactly equal the one provided, e.g. `{age:{$eeq:21}}` matches o1 but and `{age:{$eeq:"21"}}` does not.

`$neq` - A value in a property is relaxed equal the one provided, e.g. `{age:{$neq:21}}` matches o2.

`$gte` - A value in a property is greater than or equal the one provided, e.g. `{age:{$gte:20}}` matches o1 and o2.

`$gt` - A value in a property is greater than the one provided, e.g. `{age:{$gt:20}}` matches o1 and o2.

## Logical Operators [top](#top)

`$and` -  Ands multiple conditions, e.g. `{age:{$and:[{$gt:20},{$lt: 30}]}` matches o1 and o2. Typically not required
because this produces the same result, `{age:{$gt:20,$lt: 30}}`.

`$not` - Negates the contained condition, e.g. `{age:{$not:{$gt:20}}}` matches o2.

`$or` - Ors multiple conditions, e.g. `{age:{$or:[{$eq:20},{$eq: 21}]}` matches o1 and o2. The nested
form is also supported, `{age:{$eq:20,$or:{$eq: 21}}}`

`$xor` - Exclusive ors multiple conditions.

## Date and Time [top](#top)

To be written

## Membership [top](#top)

`$in` - A value in a property is in the provided array, e.g. `{age:{$in:[20,21,22]}}` matches o1 and o2.

`$nin`  - A value in a property is not in the provided array, e.g. `{age:{$nin:[21,22,23]}}` matches o2.

`$includes` -

`$excludes` -

`$intersects` -

`$disjoint` -

## Ranges [top](#top)

`$between` - A value in a property in between the two provided limits. The limits can be in any order, 
e.g. `{age:{$between:[19,21]}}` or `{age:{$between:[21,19]}}` matches o2. Optionally, the limits can be inclusive,
e.g. `{age:{$between:[19,21,true]}}` matches o1 and o2.

`$outside` - A value in a property in outside the two provided limits. The limits can be in any order, 
e.g. `{age:{$outside:[19,20]}}` or `{age:{$between:[20,19]}}` matches o1.

`$near` - A value in a property is near the provided number either from an absolute or percentage perspective, 
e.g. `{age:{$near:[21,1]}}` matches both o1 and o2 as does `{age:{$near:[21,"5%"]}}` since 1 is 4.7% of 21.

## Regular Expression [top](#top)

`$matches` - A value in a property matches the provided regular expression. The regular expression can be
a string that looks like a regular expression or an actual regular expression, e.g. `{userName:{$matches:/a.*/}}`
or `{userName:{$matches:"/a.*/"}}`

## Special Tests [top](#top)

Note that special tests typically take `true` as an argument. This is an artifact of JSON format that does not allow
empty properties. Passing anything else will cause them to fail. You may occassionaly want to pass `false` to match
things that do not satisfy the test.

`$isCreditCard` - A value in a property is a valid credit card based on a regular expression and Luhn algorithm.

`$isEmail` - A value in a property is a valid e-mail address by format, e.g. `{email:{$isEmail: true}}`. Note:
e-mail addresses are remarkably hard to validate without actually trying to send and e-mail. This will address
all reasonable cases.

`$isEven` - A value in a property is even, e.g. `{age:{$isEven: true}}` matches o2.

`$isFloat` - A value in a property is a float, e.g. `{age:{$isFloat: true}}` will not match either o1 or o2. Note,
0 and 0.0 are both treated as 0 by JavaScript, so 0 will never satisfy $isFloat.

`$isIPAddress` - A value in a property is a dot delimited IP address, e.g. `{registeredIP:{$isIPAddress: true}}

`$isInt` - A value in a property is a dot delimited IP address, e.g. `{registeredIP:{$isIPAddress: true}} matches o1.

`$isNaN` - A value in a property is a not a number, e.g. `{address:{zipcode:{$isNaN: true}}} matches o1. Note, $isNaN
will fail when there is no value since it is no known whether the target is a number or not.

`$isOdd` - A value in a property is odd, e.g. `{age:{$isOdd: true}}` matches o1.

`$isSSN` - A value in a property looks like a Social Security Number, e.g. `{SSN:{$isSSN: true}}` matches o1. Note,
unlike `$isCreditCard` no validation is done beyond textual format.

## Text Search [top](#top)

`$echoes` - A value in a property sounds like the provided value, e.g. `{userName:{$echoes: "jo"}}` matches o1.

`$search` - Does a full text trigram based search, e.g. `{favoritePhrase:{$search:"question"}}` matches o1. If
no second argument is provided, the search is fuzzy at 80%, e.g. `{favoritePhrase:{$search:"questin"}}` also
matches o1 whereas `{favoritePhrase:{$search:["questin",.99]}}`, which requires a 99% match does not. The search
phrase can have multiple space separated words.


<a name="access-control"></a>
# Access Control [top](#top)

The Thunderclap security mechanisms support the application of role based read and write access rules for functions,
objects, properties and storage keys. 

If a user is not authorized read access to an object or key value, it will not be returned. If a user is not 
authorized access to a particular property, the property will be stripped from the object before the
object is returned. Additionally, a query for an object using properties to which a user does not have access
will automatically drop the properties from the selection process to prevent data leakage through inference.

If a user is not authorized write access to specific properties on an object, update attempts will 
fall back to partial updates on just those properties for which write access is allowed. If write access to a
key or an entire object is not allowed, the write will simply fail and return `undefined`.

At the moment, by default, all keys, objects, and properties are available for read and write unless specifically
controlled in the `acl.js` file in the root of the Thunderclap repository. A future release will support defaulting
to prevent read and write unless specifically permitted.

If the user is not authorized to execute a function a 403 status will be returned.

The default `acl.js` file is show below.

```javacript
(function () {
	module.exports = {
		securedTestReadKey: { // for testing purposes
			read: [] // no reads allowed
		},
		securedTestWriteKey: { // for testing purposes
			write: [] // no writes allowed
		},
		securedTestFunction: { // for testing purposes
			execute: [] // no execution allowed
		},
		[/\!.*/]: { // prevent direct index access by anyone other than a dbo, changing may create a data inference leak
			read: ["dbo"],
			write: ["dbo"]
		},
		clear: { // only dbo can clear
			execute: ["dbo"]
		},
		entries: { // only dbo can list entries
			execute: ["dbo"]
		},
		keys: { // only dbo can list keys
			execute: ["dbo"]
		},
		values: { // only dbo can list values
			execute: ["dbo"]
		},
		"User@": { // key to control, user <cname>@ for classes
			
			// read: ["<role>",...], // array or map of roles to allow read, not specifying means all have read
			// write: {<role>:true}, // array or map of roles to allow write, not specifying means all have write
			// a filter function can also be used
			// action with be "read" or "write", not returning anything will result in denial
			// not specifying a filter function will allow all read and write, unless controlled above
			// a function with the same call signature can also be used as a property value above
			filter: async function({action,user,data,request}) {
				// very restrictive, don't return a user record unless requested by the dbo or data subject
				if(user.roles.dbo || user.userName===data.userName) {
					return data;
				}
			},
			properties: { // only applies to objects
				read: {
					// example of using a function, only dbo's and data subjects can get roles
					roles: ({action,user,object,key,request}) => user.roles.dbo || object.userName===user.userName, 
					hash: ["dbo"], // only dbo's can read passwod hashes
					salt: {
						dbo: true // example of alternate control form, only dbo's can read password salts
					}
				},
				write: {
					password: {
						// a propery named password can never be written
					},
					// only the dbo and data subject can write a hash and salt
					hash: ({action,user,object,key,request}) => user.roles.dbo || object.userName===user.userName,
					salt: ({action,user,object,key,request}) => user.roles.dbo || object.userName===user.userName,
					//userName: ({action,user,object,key,request}) => object.userName!=="dbo" // can't change name of primary dbo
				},
				filter: async function({action,user,object,key}) {
					return true; // allows all other properties to be read or written, same as having no filter at all
				}
			}
		}
	}
}).call(this);
```

Roles can also be established in a tree that is automatically applied at runtime. See the file `roles.js`.

When Thunderclap is first initialized, a special user `User@dbo` with the user name `dbo` the role `dbo` and the
dbo password defined in `thunderclap.json` is created. It also has the unique id `User@dbo`.

You can create additional accounts with the `createUser` and change passwords with the `changePassword` 
methods documented above.

<a name="analytics"></a>
# Inline Analytics & Hooks [top](#top)

Inline analytics and hooks are facilitated by the use of JOQULAR patterns and tranform or hook calls in the file `when.js`.
The transforms and hooks can be invoked from the browser, a service worker, or in the cloud. Yhey are not currently access
controlled in the browser or a service worker. In the cloud transforms are invoked after it is determined primary key access
is allowed but before data property access is assesed and the data is written. This security is applied to the transformed
data. Hooks are called after the data is written. Below is an example.

```javascript
(function() {
	module.exports = {
		browser: [
			{
				when: {testWhenBrowser:{$eq:true}},
				transform: async (data,pattern) => { 
					// deletes everything except `testWhenBrowser` from the data being put
					Object.keys(data).forEach((key) => { if(!pattern[key]) delete data[key]; });
					return data;
				},
				call: async (data,pattern) => {
					
				}
			}
		],
		cloud: [
			{
				when: {testWhen:{$eq:true}},
				transform: async (data,pattern) => {
					// deletes everything except `testWhen` from the data being put
					Object.keys(data).forEach((key) => { if(!pattern[key]) delete data[key]; });
					return data;
				},
				call: async (data,pattern) => {
					
				}
			}
		],
		worker: [
			
		]
	}
}).call(this);

```

<a name="triggers"></a>
# Triggers [top](#top)

Triggers can get invoked before and after key value or indexed object properties change or get deleted. The triggers are configure in 
the file `triggers.js`. Any asynchronous triggers will be awaited. `before` triggers must return truthy for execution to
continue, i.e. a before on set that returns false with result in the set aborting. `before` triggers are fired immediately
before security checks. Triggers are not access controlled.

Triggers can be executed in the browser, a service worker, or the cloud.

```javascript
(function() {
	module.exports = {
		browser: {
		
		},
		cloud: {
			"<keyOrRegExp>": {
				before: { // user and request are frozen, data can be modified
					put({user,data,request}) {
						// if data is an object, it can be modified
						// if a value other than undefined is returned, it will replace the data
						return true;
					},
					remove({user,data,request}) {
						
						return true;
					}
				},
				after: { // will not be awaited, called via setTimeout
					put({user,data,request}) {
						// might send e-mail
						// call a webhook, etc.
						
					},
					remove({user,data,request}) {
						
					}
				}
			},
			"<className>@": {
				before: { // user and request are frozen, data can be modified
					put({user,object,request}) {
						// can modify the object
						// if a value other than undefined is returned, it will replace the object
						return true;
					},
					update({user,object,property,value,oldValue,request}) {
						
						return true;
					},
					remove({user,object,request}) {
						
						return true;
					}
				},
				after: { // will not be awaited, called via setTimeout
					put({user,object,request}) {
						// might send e-mail
						// call a webhook, etc.
					},
					update({user,object,property,value,oldValue,request}) {
						
					},
					remove({user,object,request}) {
						
					}
				}
			}
		},
		worker: {
			//  not yet implemented
		}
	}
}).call(this);
```
<a name="functions"></a>
# Functions [top](#top)

Exposing server functions to the JavaScript client in the browser is simple. Just define the functions in 
the file `functions.js`. Any asynchronous functions will be awaited.

```javascript
(function() {
	module.exports = {
		securedTestFunction() {
			return "If you see this, there may be a security leak";
		},
		getDate() {
			return new Date();
		}
	}
}).call(this);
```

The functions will automatically become available in the admin client `docs/thunderclap`. Function execution can
be access controlled in `acl.js`.

<a name="indexing"></a>
# Indexing [top](#top)

All properties of objects inserted using `putItem` are indexed with the exception of properties containing strings over
128 characters in length. Objects that are just a value to `setItem` are not indexed. The index is not partitioned per 
class, it spans all classes.

The root index node can be accessed via `keys("!")`. Direct access is restricted to users with the role `dbo`.

Indexes in Thunderclap consume very little RAM, they are primarily composed of specially formed and partitioned keys 
pointing to just the value `1`. The existence of keys is used to infer the existence of data. This means the performance 
of Thunderclap is heavily dependent on the performance of the Cloudflare KV with respect to iterating keys. It also means 
that Thunderclap can have an unlimited number of objects indexed. The largest object that can be stored is 2MB 
(the same as Cloudflare KV).

<a name="full-text"></a>
## Full Text Indexing [top](#top)

To be written


<a name="schema"></a>
# Schema [top](#top)

To be written.


<a name="development"></a>
# Development [top](#top)

If you wish to modify Thunderclap, you must subscribe to the Cloudflare Argo tunneling service on the domain where 
you wish to use Thunderclap.

Create a Cloudflare Workers KV namespace using the Cloudflare Workers control panel. By convention the following 
name form is recommended so that the name parrallels the name of the worker script generated by the Thunderclap.

`<devHost>-thunderclap-<primaryHostName>-<com|org|...>`

e.g. `myname-thunderclap-mydomain-com` is the KV namespace and script name associated with `myname-thunderclap.mydomain.com`

You do not need a CNAME record for your dev host, Argo manages this for you.

Run the thunderclap script:

`npm run thunderclap`

If the 'mode' in 'thunderclap.json` is set to `development`, then in addition to deploying the worker script to
`<devHost>-thunderclap-<primaryHostName>-<com|org|...>` with a route, a local web server is started with an Argo tunnel 
to access `<dev-host-prefix>-thunderclap.<your-domain>` via your web browser.

If you access `https://<dev-host-prefix>-thunderclap.<your-domain>/test/` via your web browser, the unit test file 
will load. 

When in dev mode, files are watched by webpack and any changes cause a re-bundling and deployment of the worker script
to Cloudflare.

<a name="development"></a>
## Admin UI [top](#top)

When in development mode, there is a primitive UI for making one-off requests at 
`https://<dev-host-prefix>-thunderclap.<your-domain>/thunderclap.html`. This UI exposes all of the functions
available via the [Javascript](#javascript) client.

# History and Roadmap [top](#top)

Many of the concepts in Thunderclap were first explored in ReasonDB. ReasonDB development has been suspended for now, 
but many features found in ReasonDB will make their way into Thunderclap if interest is shown in the software. This
includes the addition of graph queries a la GunDB and joins.

# Change Log (reverse chronological order) [top](#top)

2019-07-12 v0.0.23a Full text search repaired. Optimized inserts and deletes. NAMESPACES must be recreated.

2019-07-12 v0.0.22a Ehanced documentation. Completely re-worked indexing to allow for more object storage. Full text search
currently broken. NAMESPACES must be re-created.

2019-07-11 v0.0.21a Ehanced documentation.

2019-07-10 v0.0.20a Ehanced documentation. Added `Position` and `Coordinates`.

2019-07-09 v0.0.19a Server was throwing errors on date predicates. Fixed. Added support for un-indexing nested objects.
Unindexing full-text not yet implemented. Added a short term cache to improve performance. Unit tests for removeItem are
failing as a result. Not sure why.

2019-07-06 v0.0.18a Added nested object indexing (unindex does not yet work).

2019-07-04 v0.0.17a Added full text indexing with `{$search: string terms}` or `{$search: [string terms, number pctMatch]}`

2019-07-03 v0.0.16a Added `changePassword(userName,password,oldPassword)`.

2019-07-02 v0.0.15a Added `clear(prefix)`, `entries(prefix,options)`, `hasKey(key)`, `values(prefix,options)`.
All are limited to dbo access. Reverted to two level index for now to address performance. Limits number of 
entries per index due to 128MB limit of Cloudflare Workers.

2019-06-30 v0.0.14a Ehanced triggers and functions to allow browser, service worker, or cloud execution. 
Added `when` capability. Service worker support will operate once service workers are generated during the
build process.

2019-06-26 v0.0.13a Indexing optimized to reeuce RAM usage. Substantive performance drop.

2019-06-26 v0.0.12a Indexing now extends to 3 levels to provide more data spread. Sub-objects still not 
indexed as direct paths. Added support for expiring keys and listing keys.

2019-06-25 v0.0.11a Code optimizations and bug fixes.

2019-06-24 v0.0.10a Custom function support added.

2019-06-22 v0.0.9a Triggers on put, update, remove.

2019-06-22 v0.0.8a Triggers now working for `putItem`.

2019-06-22 v0.0.7a Added JOQULAR pattern `$near:[target,range]`. Range can be a number, in which case it is 
added/substracted or a string ending in the `%` sign, in which case the percentage is add/substracted. Added 
stress tests up to 1000 items. Started support for RegExp as acl keys. Enhanced doucmentation.

2019-06-21 v0.0.6a Documentation improvements.

2019-06-21 v0.0.5a ACL improvements. More of unit tests.

2019-06-20 v0.0.4a Added a large number of unit tests


