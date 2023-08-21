const fbadmin = require("firebase-admin");
const app = fbadmin.initializeApp({databaseURL: "http://localhost:9097/?ns=remotedev-africa"}, "DEFAULT");
// module.exports = {app};
exports.app = app;
