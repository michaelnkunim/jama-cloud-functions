const fbadmin = require("firebase-admin");
fbadmin.initializeApp({}, "DEFAULT");
const cors = require("cors")({origin: true});
const functions = require("firebase-functions");
const algoliaSearch = require("algoliasearch");
const messaging = require("./messaging");
const util = require("./util");
const uuid = require("uuid");
const firestore = fbadmin.firestore();
// const rtdb = fbadmin.database();
const algoliaConfig = {
  key: "0d61d827b8499b88b6714d8a7cde290f",
  app: "L6F10XSYEB",
};
const appName = "Jama";
const appDomain = "https://jama.com.gh";
const APP_ID = algoliaConfig.app;
const ADMIN_KEY = algoliaConfig.key;
const client = algoliaSearch(APP_ID, ADMIN_KEY);
// const indexProd = client.initIndex("prod_Jama247");
const indexDev = client.initIndex("dev_jama");

exports.addToListingsIndex_dev = functions.firestore
    .document("dev_listings/{listingId}")
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
      return indexDev.saveObject(listing);
    });

exports.updateListingIndexItem_dev = functions.firestore
    .document("dev_listings/{listingId}")
    .onUpdate((snapshot) => {
      const data = snapshot.after.data();
      const objectID = snapshot.after.id;
      delete data["views"];
      const listing = data;
      updateDevSingleAdStatus(data, objectID);
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
      return indexDev.partialUpdateObject(listing, {
        createIfNotExists: true,
      });
    });

exports.removeItemFromListingIndex_dev = functions.firestore
    .document("dev_listings/{listingId}")
    .onDelete((snapshot, context) => {
      console.log("id", snapshot.id);
      return indexDev.deleteObject(snapshot.id);
    });

exports.onUserDelete_dev = (res) => functions.firestore
    .document("dev_user/{userId}")
    .onDelete((deleted) => {
      console.log(deleted.id);

      try {
        const user = fbadmin.auth().getUser(deleted.id);
        if (user.code !== "auth/user-not-found") {
          fbadmin.auth().deleteUser(deleted.id);
        }
      } catch (error) {
        //  console.log(error);
        res.send(error);
      }

      try {
        const bucket = fbadmin.storage().bucket("users/" + deleted.id);
        const exists = bucket.exists();
        if (exists) {
          bucket.delete();
        }
      } catch (error) {
        console.log("bucketError", error);
      }
      return null;
    });

exports.notificationsTrigger_dev = functions.firestore
    .document("dev_user/{userId}/notes/{noteId}")
    .onCreate((snapshot) => {
      const userId = snapshot.ref.path.split("/")[1];
      const noteData = snapshot.data();
      noteData.uid = snapshot.id;
      messaging.processMessageToChannels(noteData, userId);
      return 1;
    });

exports.onUserCreate_dev = functions.firestore
    .document("dev_user/{userId}")
    .onCreate((snapshot) => {
      // console.log(snapshot.data().uid);
      // const userId = snapshot.data().uid;
      // const docRef = firestore.doc("user/" + userId);
      // const rtdbref = rtdb.ref("user/" + userId);
      // docRef.update({actionTriggerList: {sent_welcome_message: false}});
      // rtdbref.set({status: 1, timestamp: Date.now()});
      return 1;
    });

exports.onchatUpdate_dev =
functions.firestore.document("dev_chat/{chatId}").onUpdate(
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
        // if (lastMarkedForNotif) {
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
          "noteGroup": latestData.uid,
        };
          // eslint-disable-next-line max-len
        console.log("pushNotified : ", lastMarkedForNotif.pushNotified, Date.now());
        if (lastMarkedForNotif.pushNotified === false) {
          // console.log(newNote);
          // eslint-disable-next-line max-len
          const docRef = firestore.collection("user/"+lastMarkedForNotif.notifyObject.target+"/notes/");
          docRef.add(newNote);
        }
        // }
      }
      // }
      return true;
    });

// exports.updateAdStatus = functions.pubsub.schedule("every 2 minutes").
//     onRun((context)=>{
//       const query = firestore.collection("listings")
//           .where("promoActive", "==", true);
//       query.get().then((querySnapshot) => {
//         querySnapshot.forEach((documentSnapshot) => {
//           console.log("checking for docs");
//           console.log(`Found document at ${documentSnapshot.ref.path}`);
//         });
//       });
//     });


exports.updateAdStatus_dev = functions.pubsub.schedule("every 60 minutes").
    onRun((context)=>{
      // eslint-disable-next-line max-len
      const query = firestore.collection("dev_listings")
          .where("promoActive", "==", true);
      query.get().then((querySnapshot) => {
        querySnapshot.forEach((documentSnapshot) => {
          const data = documentSnapshot.data();
          const id = documentSnapshot.id;
          if (data.promoActive === true && data.promotions.length > 0) {
            updateDevSingleAdStatus(data, id);
          }
        });
      });
      return 1;
    });

const updateDevSingleAdStatus = (data, id) => {
  const promotionData = data.promotions[data.promotions.length -1];
  const intervalObject = util.timeAgo(promotionData.date);
  // eslint-disable-next-line max-len
  const remainingTenure = promotionData.package.duration - intervalObject["day"];
  Object.assign(promotionData,
      {intervalObject}, {remainingTenure});
  if (remainingTenure < 1) {
    // eslint-disable-next-line max-len
    const promotions = data.promotions.map((i)=>{
      i.active = false;
      return i;
    });
    console.log(promotions);
    // eslint-disable-next-line max-len
    firestore.doc("dev_listings/"+id).update({promoActive: false, promotions});
    console.log("updated");
  } else {
    console.log("remainingTenure", remainingTenure);
  }
  // const getUser = fbadmin.firestore.doc("user/"+data.user).get();
  // getUser.then((res) => {
  // const userData = res.data();
  // messaging.sendPromotionReminder(promotionData, data, userData);
  // });
};

exports.createSeller_dev = functions.https.onRequest((request, response) => {
  cors(request, response, () => {
    if (request.method !== "POST") {
      response.status(405).send("Method Not Allowed");
    } else {
      const body = request.body;
      const email = body.credentials.email;
      const password = body.credentials.password;
      const phoneNumber = body.credentials.phoneNumber;
      fbadmin.auth().createUser({
        email: email,
        emailVerified: false,
        password: password,
        disabled: false,
      }).then((userRecord) => {
        body.userData.uid = userRecord.uid;
        body.userData.hash = userRecord.uid;
        firestore.doc("dev_user/"+userRecord.uid).set(body.userData);
        fbadmin.auth().updateUser(userRecord.uid, {
          phoneNumber: phoneNumber,
        });
        return response.status(200)
            .send({
              msg: "Successfully created new user: " +userRecord.uid,
              data: userRecord,
            });
      })
          .catch((error) => {
            return response.status(200).send({
              msg: "Failed To Create the user",
              status: "error",
              error,
            });
          });
    }
  });
});
