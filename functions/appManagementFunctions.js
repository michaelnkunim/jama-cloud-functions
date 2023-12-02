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
      const payload = {...request.body};
      payload.timestamp = new Date().getTime();
      await firestore.collection(collectionName).add(payload);
      response.status(200).send(payload);
    }
  });
});
