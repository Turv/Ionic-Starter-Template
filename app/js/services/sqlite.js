(function () {
	'use strict';

	angular
		.module('App')
		.service('$sqliteService', $sqliteService);

	$sqliteService.$inject = ['$q', '$cordovaSQLite'];
	function $sqliteService($q, $cordovaSQLite) {

		var self = this;
		var _db;

		self.db = function () {
			if (!_db) {
				if (window.sqlitePlugin !== undefined) {
					_db = window.sqlitePlugin.openDatabase({ name: "app.db", location: 2, createFromLocation: 1 });
				} else {
					// For debugging in the browser
					_db = window.openDatabase("app.db", "1.0", "Database", 200000);
				}
			}
			return _db;
		};

		self.getFirstItem = function (query, parameters) {
			var deferred = $q.defer();
			self.executeSql(query, parameters).then(function (res) {

				if (res.rows.length > 0)
					return deferred.resolve(res.rows.item(0));
				else
					return deferred.reject("There aren't items matching");
			}, function (err) {
				return deferred.reject(err);
			});

			return deferred.promise;
		};

		self.getFirstOrDefaultItem = function (query, parameters) {
			var deferred = $q.defer();
			self.executeSql(query, parameters).then(function (res) {

				if (res.rows.length > 0)
					return deferred.resolve(res.rows.item(0));
				else
					return deferred.resolve(null);
			}, function (err) {
				return deferred.reject(err);
			});

			return deferred.promise;
		};

		self.getItems = function (query, parameters) {
			var deferred = $q.defer();
			self.executeSql(query, parameters).then(function (res) {
				var items = [];
				for (var i = 0; i < res.rows.length; i++) {
					items.push(res.rows.item(i));
				}
				return deferred.resolve(items);
			}, function (err) {
				return deferred.reject(err);
			});

			return deferred.promise;
		};

		self.preloadDataBase = function (enableLog) {
			var deferred = $q.defer();

			//window.open("data:text/plain;charset=utf-8," + JSON.stringify({ data: window.queries.join('').replace(/\\n/g, '\n') }));
			if(enableLog) console.log('%c ***************** Starting the creation of the database in the browser ***************** ', 'background: #222; color: #bada55');
			self.db().transaction(function (tx) {
				self.migrate();
			}, function (error) {
				deferred.reject(error);
			}, function () {
				if(enableLog) console.log('%c ***************** Completing the creation of the database in the browser ***************** ', 'background: #222; color: #bada55');
				deferred.resolve("OK");
			});

			return deferred.promise;
		};

		self.executeSql = function (query, parameters) {
			return $cordovaSQLite.execute(self.db(), query, parameters);
		};

		/**
		 * Helper method to execute an array of queries
		 * 
		 * @param array Queries to run
		 */
		self.executeInChain = function(queries) {
			var promise = queries.reduce(function(previous, query) {      		
				return previous.then(function() {
					return self.executeSql(query, []).then(function(result) {
						return $q.when(query);
					}, function(error) {
						console.log('[ERROR] ' + error.message);
					}); 
				});
			}, $q.when());
    		
			return promise;			
		};

		/**
		 * Returns the current database version from the database
		 * 
		 * @returns int Current Version Number
		 */
		self.selectCurrentVersion = function() {
			var query = "SELECT MAX(versionNumber) AS maxVersion FROM version_history";
    		var promise = self.executeSql(query).then(function(res) {
        		var maxVersion = res.rows.item(0).maxVersion;
        		return maxVersion;
      		});
			  
    		return promise;
  		};
		  
		/**
		 * Update the database version once a migration has been applied
		 * 
		 * @param int Version Number
		 * @returns int Current Version Number
		 */
		self.storeVersionInHistoryTable = function(versionNumber) {
    		var query = "INSERT INTO version_history (versionNumber, migratedAt) VALUES (?, ?)";
    		var promise = self.executeSql(query, [versionNumber, new Date().toISOString()]).then(function(res) {
        		return versionNumber;
      		});
    		return promise;
  		};
		  
		/**
		 * Creates a version history table if one doesn't yet exist
		 * 
		 * @returns int
		 */
		self.createVersionHistoryTable = function() {
    		var query = "CREATE TABLE IF NOT EXISTS version_history(versionNumber INTEGER PRIMARY KEY NOT NULL, migratedAt DATE)";
    		var promise = self.executeSql(query, []).then(function() {
      			var versionNumber = 0;
      			return versionNumber;
    		});
    		return promise;
  		};
		  
		/**
		 * Automatic Migration
		 * 
		 * Determines the current version of the database and then applies any missing migrations where
		 * the database version is behind
		 */
		self.migrate = function() 
		{
			// Create our version history table, and determine the current version prior to applying any updates 
			var initialSteps = [
				self.createVersionHistoryTable,
				self.selectCurrentVersion
			];
			
			// For each migration, check if our current database version is behind the proposed version number
			var migrationSteps = window.appDb.migrations.map(function(version) {
      			return function(currentVersion) {
        			if (currentVersion >= version.versionNumber)
          				return $q.when(currentVersion);

        			var promise = self.executeInChain(version.queries).then(function() {
          				return version.versionNumber;
        			}).then(self.storeVersionInHistoryTable);
        			return promise;
      			};
			});
			
			var steps = initialSteps.concat(migrationSteps);
			steps.reduce(function(current, next) {
				return current.then(next);
			}, $q.when())			
			.then(function() {
				// All migrations applied
				console.log('[Db Migration] All Migrations Applied')
			})
			.catch(function(error) {
				console.log('Error: ' + JSON.stringify(error));
			});			
		};

	}
})();