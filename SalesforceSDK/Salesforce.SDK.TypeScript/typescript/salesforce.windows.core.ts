﻿/// <reference path="../typings/WinJS-3.0.d.ts"/>
/// <reference path="../typings/Salesforce.SDK.Hybrid.d.ts"/>
/// <reference path="../typings/winrt.d.ts"/>

module SalesforceJS {

    export class BootConfig {
        public remoteAccessConsumerKey: string;
        public oauthRedirectURI: string;
        public oauthScopes: string[];
        public isLocal: boolean;
        public startPage: string;
        public errorPage: string;
        public shouldAuthenticate: boolean;
        public attemptOfflineLoad: boolean;
    }

    export class Server {
        name: string;
        address: string;

        constructor(n: string, a: string) {
            this.name = n;
            this.address = a;
        }
    }

    export class ServerConfig {
        public allowNewConnections: boolean;
        public serverList: Array<Server>;
    }

    export class OAuth2 {

        private config: BootConfig;
        private servers: ServerConfig;
        private auth = Salesforce.SDK.Hybrid.Auth;
        private rest = Salesforce.SDK.Hybrid.Rest;

        constructor() {
            this.config = new BootConfig();
            this.servers = new ServerConfig();
        }

        public configureOAuth(bootConfig: string, serverConfig: string) {
            if ((/^\s*$/).test(bootConfig)) {
                bootConfig = "data/bootconfig.json";
            }
            this.servers = new ServerConfig();
            var self = this;
            return new WinJS.Promise((resolve, reject, progress) => {
                WinJS.xhr({ url: bootConfig }).then((response) => {
                    self.loadBootConfig(response.responseText);
                    progress();
                }).then(() => {
                    WinJS.xhr({ url: "data/servers.xml" }).done((response) => {
                        self.loadServerXml(response);
                        resolve(self);
                    });
                });
            });
        }

        private loadBootConfig(response: string) {
            this.config = JSON.parse(response);
        }

        private loadServerXml(response: XMLHttpRequest) {
            var data = response.responseXML;
            var serverItems = data.querySelectorAll("servers > server");
            var serversList = new Array<Server>();
            for (var i = 0; i < serverItems.length; i++) {
                var server = serverItems[i];
                serversList.push({ name: server.attributes.getNamedItem("name").value, address: server.attributes.getNamedItem("url").value });
            }
            this.servers.serverList = serversList;
        }

        public loginDefaultServer() {
            return this.login(this.servers.serverList[0]);
        }

        public login(server: Server) {
            var auth = Salesforce.SDK.Hybrid.Auth;
            auth.HybridAccountManager.initEncryption();
            var boot = this.config;
            return new WinJS.Promise((resolve, reject, progress) => {
                var options = new auth.LoginOptions(server.address, boot.remoteAccessConsumerKey, boot.oauthRedirectURI, boot.oauthScopes);
                var startUriStr = auth.OAuth2.computeAuthorizationUrl(options);
                var startUri = new Windows.Foundation.Uri(startUriStr);
                var endUri = new Windows.Foundation.Uri(boot.oauthRedirectURI);
                Windows.Security.Authentication.Web.WebAuthenticationBroker.authenticateAsync(
                        Windows.Security.Authentication.Web.WebAuthenticationOptions.none, startUri, endUri)
                    .done(result => {
                        if (result.responseData == "") {
                            reject(result.responseStatus);
                        } else {
                            var responseResult = new Windows.Foundation.Uri(result.responseData);
                            var authResponse = responseResult.fragment.substring(1);
                            auth.HybridAccountManager.createNewAccount(options, authResponse).done(newAccount => {
                                if (newAccount != null) {
                                    resolve(newAccount);
                                } else {
                                    reject(result.responseErrorDetail);
                                }
                            });
                        }
                    }, err => {
                        reject(err);
                    });
                progress();
            });
        }

        public logout() {
            return new WinJS.Promise((resolve) => {
                var cm = new this.rest.ClientManager();
                var client = cm.peekRestClient();
                if (client != null) {
                    cm.logout().done(() => {
                        resolve();
                    });
                } else {
                    resolve();
                }
            });   
        }

        public getAuthCredentials(success, fail) {
            var account = this.auth.HybridAccountManager.getAccount();
            if (account != null) {
                success(this.auth.Account.toJson(account));
            } else {
                fail();
            }
        }

        public forcetkRefresh (success, fail) {
            var account = this.auth.HybridAccountManager.getAccount();
            if (account != null) {
                this.auth.OAuth2.refreshAuthToken(account).done(resolve => {
                    success(resolve);
                }, reject => {
                    fail(reject);
                });
            } else {
                fail(null);
            }
        }

        public getUsers(success, fail) {
            var imapAccounts = this.auth.HybridAccountManager.getAccounts();
            if (imapAccounts != null && imapAccounts.size > 0) {
                var first = imapAccounts.first();
                var accounts = new Array<Salesforce.SDK.Hybrid.Auth.Account>();
                accounts.push(<Salesforce.SDK.Hybrid.Auth.Account>first.current.value);
                while (first.moveNext()) {
                    accounts.push(<Salesforce.SDK.Hybrid.Auth.Account>first.current.value);
                }
                success(accounts);
            } else {
                fail(null);
            }
        }

        public getUser(success, fail) {
            var account = this.auth.HybridAccountManager.getAccount();
            if (account != null) {
                success(account);
            } else {
                fail(null);
            }
        }

        public switchToUser(account : Salesforce.SDK.Hybrid.Auth.Account) {
            return this.auth.HybridAccountManager.switchToAccount(account);
        }
    }

}
