/* Service Layer module to interact with B1 Data */
/* Server Configuration and User Credentials set in environment variables */


//Load Node Modules
const request = require('request') // HTTP Client
const moment = require('moment') // Date Time manipulation

// Set export functions
module.exports = {
    GetSalesInfo: function (year, quarter, callback) {
        return (GetSalesInfo(year, quarter, callback))
    },
    PostSalesOrder: function (body, callback) {
        return (PostSalesOrder(body, callback))
    }
}

//Service Layer Cookies
var SLCOOKIES = []
var SLEXPIRE = null
var SLTIMEOUT = null


// ------------------ Main SL Methods -------------------------

function ServiceLayerRequest(isReport, method, endpoint, callback) {

    var options = {
        url: process.env.B1_HOST + ":" + process.env.B1_PORT +
            (isReport ? process.env.B1_REPORTAPI : process.env.B1_DATAAPI) +
            endpoint +
            "&$format=json",

        method: method
    }

    console.log("Preparing Service Layer Request: " + JSON.stringify(options.method) + " - " + JSON.stringify(options.url))

    getCookiesCache().then(function (cookies) {
            options.headers = {
                'Cookie': cookies
            };

            request(options, function (error, response, body) {
                if (error) {
                    console.error(error.message)
                } else {
                    if (response.statusCode == 401) {
                        //Invalid Session
                        Connect().then(function () {
                            ServiceLayerRequest(isReport, method, endpoint, callback)
                        }).catch(function (error, response) {
                            callback(error, response)
                        })
                        console.log("Request response with status: " + response.statusCode +
                            "\nRequest headers: " + JSON.stringify(response.headers))
                    }
                }
                callback(error, response, body);
            });
        })
        .catch(function () {
            Connect().then(function () {
                ServiceLayerRequest(isReport, method, endpoint, callback)
            }).catch(function (error, response) {
                callback(error, response)
            })
        })
}



let Connect = function () {
    return new Promise(function (resolve, reject) {
        
        var uri = process.env.B1_HOST + ":" + process.env.B1_PORT + process.env.B1_DATAAPI +  "/Login"

        //B1 Login Credentials
        var data = {
            UserName: process.env.B1_USER,
            Password: process.env.B1_PASS,
            CompanyDB: process.env.B1_COMP
        };

        //Set HTTP Request Options
        options = {
            uri: uri,
            body: JSON.stringify(data),
            timeout: 10000
        }
        console.log("Connecting to SL on " + uri);

        //Make Request
        request.post(options, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                console.log("Connected to SL Succeeded!")
                body = JSON.parse(body)
                setCookiesCache(response.headers['set-cookie'])
                setSLSessionTimeout(body.SessionTimeout)
                resolve();

            } else {
                console.error("Connection to Service Layer failed. \n" + error)
                reject(error, response);
            }
        });

    })

}



// ------------------ Endpoint Implementations -------------------------

function GetSalesInfo(year, quarter, callback) {
    var select = ""

    // Set endpoint (Semantic Layer)
    var oDataEndpoint = "/SalesAnalysisByDocumentQuery"
    
    // Set Odata query
    oDataEndpoint += "?$apply=groupby((PostingYear, PostingQuarter, BusinessPartnerCurrency)," +
        "aggregate($count as ItemCode_COUNT, NetSalesAmountLC with sum as NetSalesAmountLC_SUM))" +
        "&$filter=PostingYear eq " + quotes(year) +
        " and PostingQuarter eq " + quotes(quarter);

    // Remove blank spaces
    oDataEndpoint = oDataEndpoint.replace(/ /g, "%20");



    ServiceLayerRequest(true, "GET", oDataEndpoint, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            body = JSON.parse(body);
            callback(null, body);
        } else {
            callback(error);
        }
    });
}

// function PostSalesOrder(body, callback) {
//     var options = {}

//     options.url = SLServer + "/Orders"
//     options.method = "POST"
//     options.body = {
//         "CardCode" : process.env.B1_DEFAULT_BP,
//         "DocDueDate" : moment().format('YYYY-MM-DD'),
//         "Comments": "Order created via SMB Mkt Place @" + moment.now(),
//         "DocumentLines":[]
//     }
//     options.body.DocumentLines = JSON.parse(b1Normalize(JSON.stringify(body.lines)))

//     options.body = JSON.stringify(options.body);

//     ServiceLayerRequest(false, options, function (error, response, body) {
//         if (!error && response.statusCode == 201) {
//             console.log("Sales order created: "+ body.DocEntry)
//             body = odata.formatResponse(JSON.parse(body));
//             callback(null, body);

//         } else {
//             callback(error);
//         }
//     });
// }



// --------------- Handle SL Session Cookies ----------------------
/* This should be using a cache database, but for simplicity matter we are handling global var */

let getCookiesCache = function () {
    return new Promise(function (resolve, reject) {

        if (moment().isAfter(SLEXPIRE)) {
            //SessionID cached is expired or Doesn't Exist
            console.log("Cached SL Session ID Expired")
            reject()
        } else {
            if (SLCOOKIES.length > 0) {
                console.log("Cached SL Session Retrieved")
                resolve(SLCOOKIES)
            } else {
                console.log("Cached SL not found")
                reject();
            }
        }

    })
}

function setCookiesCache(cookies) {
    // Dump Previous SL Session ID Cache and creates a new one
    console.log("Storing SL Session ID in cache")
    SLCOOKIES = cookies;
}

function setSLSessionTimeout(timeout) {
    //Store the Session Timeout
    SLTIMEOUT = timeout
    SLEXPIRE = moment(moment.now()).add(timeout, 'minutes').format()
}

function updateSLSessionTimeout() {
    SLEXPIRE = moment(moment.now()).add(SLTIMEOUT, 'minutes').format()
}



// --------------- Helper for OData Queries -----------------------

function quotes(val) {
    return "%27" + val + "%27";
}

function op(op) {
    return "%20" + op + "%20";
}