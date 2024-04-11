/* eslint-disable max-len */
const {app} = require("./firebase-init");
const functions = require("firebase-functions");
const algoliaSearch = require("algoliasearch");
const messaging = require("./messaging");
const environment = require("./environement");
const firestore = app.firestore();
const client = algoliaSearch(environment.algoliaConfig.app, environment.algoliaConfig.key);
const indexProd = client.initIndex(environment.indexProdName);

const {onUserCreate, onUserDelete, onUserUpdate, createSeller} = require("./userFunctions");
const {addToListingsIndex, removeItemFromListingIndex,
  updateListingIndexItem, updateAdStatus,
  deleteFromIndex: deleteFromAlgolia,
  addToIndexViaHttp,
} = require("./listingFunctions");
const {onchatUpdate, onChatDelete} = require("./chatFunctions");
const {updateAppVersion} = require("./appManagementFunctions");

const notificationsTrigger = functions.firestore
    .document("user/{userId}/notes/{noteId}")
    .onCreate((snapshot) => {
      const userId = snapshot.ref.path.split("/")[1];
      const noteData = snapshot.data();
      noteData.uid = snapshot.id;
      messaging.processMessageToChannels(noteData, userId);
      return 1;
    });

const syncIndexs = functions.firestore.document("triggers/{uid}").onCreate(
    (snapshot)=>{
      const data = snapshot.data();
      if (data.type = "listings" && data.action === "sync") {
        // get the listing
        firestore.doc("listings/"+data.uid).get().then((res)=>{
          if (!res.exists()) {
            console.log("listing not found");
            indexProd.deleteObject(data.uid);
            // remove from triggers
            firestore.doc("triggers/"+data.uid).delete();
          }
        });
      }
      return 1;
    });


module.exports = {
  onUserCreate, onUserDelete, onUserUpdate, createSeller,
  addToListingsIndex, removeItemFromListingIndex, updateListingIndexItem, updateAdStatus, deleteFromAlgolia,
  onchatUpdate, onChatDelete,
  notificationsTrigger, syncIndexs,
  updateAppVersion, addToIndexViaHttp,
};
