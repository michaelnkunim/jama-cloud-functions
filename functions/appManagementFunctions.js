/* eslint-disable max-len */
const {app} = require("./firebase-init");
const functions = require("firebase-functions");
const cors = require("cors")({origin: true});
const firestore = app.firestore();

exports.updateAppVersion = functions.https.onRequest((request, response) => {
  cors(request, response, async () => {
    if (request.method !== "POST") {
      response.status(405).send("Method Not Allowed");
    } else {
      const collectionName = request.body.app+"-versions";
      request.body.timestamp = new Date().getTime();
      const result = await firestore.collection(collectionName).add(request.body);
      response.status(200).send(`update version to ${request.body.version} with update ID: ${result.id}`);
    }
  });
});
