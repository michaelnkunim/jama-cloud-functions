const fbadmin = require("firebase-admin");
fbadmin.initializeApp({}, "DEFAULT");

const functions = require("firebase-functions");
const algoliaSearch = require("algoliasearch");
const messaging = require("./messaging");
const uuid = require("uuid");
const firestore = fbadmin.firestore();
const rtdb = fbadmin.database();
const algoliaConfig = {
  key: "0d61d827b8499b88b6714d8a7cde290f",
  app: "L6F10XSYEB",
};
const appName = "Jama";
const appDomain = "https://jama.com.gh";
const APP_ID = algoliaConfig.app;
const ADMIN_KEY = algoliaConfig.key;
const client = algoliaSearch(APP_ID, ADMIN_KEY);
const index = client.initIndex("prod_Jama247");

exports.addToListingsIndex = functions.firestore
    .document("listings/{listingId}")
    .onCreate((snapshot) => {
      const data = snapshot.data();
      const objectID = snapshot.id;
      const listing = data;
      Object.assign(listing, {
        "title": data.title,
        "hash": objectID,
        "uid": objectID,
        "category.lvl0": data.parentCategory,
        "category.lvl1": data.parentCategory+ ">" +data.item_category,
        "location.lvl0": data.location_region_name,
        "location.lvl1": data.location_region_name+ ">" +data.location_name,
        "image_gallery": data.image_gallery,
        "item_category": data.item_category,
        "location_name": data.location_name,
        "location_region_name": data.location_region_name,
        "parentCategory": data.parentCategory,
        "price": data.price,
        "createdAt": data.createdAt,
        "data": data.data,
        "url": data.url,
        "objectID": "",
        "user": data.user,
      });
      listing.objectID = objectID;
      return index.saveObject(listing);
    });

exports.updateListingIndexItem = functions.firestore
    .document("listings/{listingId}")
    .onUpdate((snapshot) => {
      const data = snapshot.after.data();
      const objectID = snapshot.after.id;
      delete data["views"];
      const listing = data;
      Object.assign(listing, {
        "title": data.title,
        "hash": objectID,
        "uid": objectID,
        "category.lvl0": data.parentCategory,
        "category.lvl1": data.parentCategory+ ">" +data.item_category,
        "location.lvl0": data.location_region_name,
        "location.lvl1": data.location_region_name+ ">" +data.location_name,
        "image_gallery": data.image_gallery,
        "item_category": data.item_category,
        "location_name": data.location_name,
        "location_region_name": data.location_region_name,
        "parentCategory": data.parentCategory,
        "price": data.price,
        "createdAt": data.createdAt,
        "data": data.data,
        "url": data.url,
        "objectID": "",
        "user": data.user,
      });
      listing.objectID = objectID;
      console.log("update listing " + objectID);
      return index.partialUpdateObject(listing, {
        createIfNotExists: true,
      });
    });

exports.removeItemFromListingIndex = functions.firestore
    .document("listings/{listingId}")
    .onDelete((snapshot) => {
      console.log(snapshot.after.id);
      return index.deleteObject(snapshot.after.id);
    });

exports.onUserDelete = functions.firestore
    .document("user/{userId}")
    .onDelete((deleted) => {
      console.log(deleted.id);

      try {
        const user = fbadmin.auth().getUser(deleted.id);
        if (user.code !== "auth/user-not-found") {
          fbadmin.auth().deleteUser(deleted.id);
        }
      } catch (error) {
        console.log(error);
      }

      try {
        const bucket = fbadmin.storage().bucket("users/" + deleted.id);
        const exists = bucket.exists();
        if (exists) {
          bucket.delete();
        }
      } catch (error) {
        console.log(error);
      }
      return null;
    });

exports.notificationsTrigger = functions.firestore
    .document("user/{userId}/notes/{noteId}")
    .onCreate((snapshot) => {
      const userId = snapshot.ref.path.split("/")[1];
      const noteData = snapshot.data();
      noteData.uid = snapshot.id;
      messaging.processMessageToChannels(noteData, userId);
      return 1;
    });

exports.onUserCreate = functions.firestore
    .document("user/{userId}")
    .onCreate((snapshot) => {
      const userId = snapshot.id;
      const docRef = firestore.doc("user/" + userId);
      const rtdbref = rtdb.ref("user/" + userId);
      docRef.update({actionTriggerList: {sent_welcome_message: false}});
      rtdbref.set({status: 1, timestamp: Date.now()});
      return 1;
    });

exports.onchatUpdate = functions.firestore.document("chat/{chatId}").onUpdate(
    (snapshot)=>{
      const latestData = snapshot.after.data();
      // console.log(latestData);
      const messages = latestData.messages;
      // console.log(messages);
      if (messages.length > 0) {
        const today = new Date();
        const todayStart = today.setHours(0, 0, 0, 0);
        const todayEnd = today.setHours(23, 59, 59, 999);
        const todayMessages = messages.filter(
            (chat) => chat.createdAt >= todayStart &&
            chat.createdAt <= todayEnd);
        // console.log(todayMessages);
        // check if receipient is online
        // eslint-disable-next-line no-prototype-builtins
        const markedForNotificatons = todayMessages.filter( (i) => {
          return i["notifyObject"] && i.isRead === 0;
        });

        // const todayUnotifiedList = messages.filter(
        //     // eslint-disable-next-line max-len
        // (chat) => chat.lastNotified >= todayStart
        // && chat.lastNotified <= todayEnd);

        const lastMarkedForNotif =
            markedForNotificatons[markedForNotificatons.length - 1];
        // console.log(lastMarkedForNotif);
        // console.log(todayUnotifiedList);
        // if (todayUnotifiedList.length > 0) {
        if (lastMarkedForNotif) {
          const newNote = {
            "soundNotify": true,
            "image": "{system}",
            "emailInstruction": {
              "template": "message_notification",
              "receipient": null,
            },
            "appSender": appName,
            "isRead": false,
            "title": "New message from {{noteData.senderName}}",
            // eslint-disable-next-line max-len
            "smsMessage": "Hi {{noteData.receipientName}}, {{noteData.senderName}} sent you a message on {{noteData.appName}}. Click on this link {{noteData.chatUrl}} to view on {{noteData.hostUrl}} ",
            "type": "user",
            "content": lastMarkedForNotif.content,
            "createdAt": Date.now(),
            "actionPhrase": "view",
            "channels": lastMarkedForNotif.notifyObject.channels,
            "dynamicJson": lastMarkedForNotif.noteData,
            "link": lastMarkedForNotif.noteData.chatUrl,
            "domain": appDomain,
            "id": uuid.v4(),
            "inAppNotified": false,
            "dateRead": "",
            "soundNotified": false,
          };
          // eslint-disable-next-line max-len
          console.log("pushNotified : ", lastMarkedForNotif.pushNotified, Date.now());
          if (lastMarkedForNotif.pushNotified === false) {
            // console.log(newNote);
            // eslint-disable-next-line max-len
            const docRef = firestore.collection("user/"+lastMarkedForNotif.notifyObject.target+"/notes/");
            docRef.add(newNote);
          }
        }
      }
      // }
      return true;
    });
