/* eslint-disable max-len */
const {app} = require("./firebase-init");
const cors = require("cors")({origin: true});
const functions = require("firebase-functions");
const algoliaSearch = require("algoliasearch");
const messaging = require("./messaging");
const util = require("./util");
const uuid = require("uuid");
const environment = require("./environement");
const firestore = app.firestore();
const rtdb = app.database();

const client = algoliaSearch(environment.algoliaConfig.app, environment.algoliaConfig.key);
const indexProd = client.initIndex(environment.indexProdName);
const userIndex = client.initIndex(environment.userIndexName);
// //////////////// PROD ///////////////////////

const updateUserListings = (userId) => {
  // get all listings where user === userId
  const listings = [];
  const query = firestore.collection("listings")
      .where("user", "==", userId);
  query.get().then((querySnapshot) => {
    querySnapshot.forEach((documentSnapshot) => {
      // console.log(`Found document at ${documentSnapshot.ref.path}`);
      listings.push(documentSnapshot.id);
      firestore.doc("user/"+userId).update({listings: listings});
      console.log("listings found for seller", listings);
    });
  });
};

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
      updateUserListings(data.user);
      return indexProd.saveObject(listing);
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
      updateUserListings(data.user);

      updateSingleAdStatus(data, objectID);

      listing.objectID = objectID;
      // console.log("update listing " + objectID);
      return indexProd.partialUpdateObject(listing, {
        createIfNotExists: true,
      });
    });

exports.removeItemFromListingIndex = functions.firestore
    .document("listings/{listingId}")
    .onDelete((snapshot) => {
      try {
        console.log(snapshot.id);
        // console.log("listing deleted", snapshot.data());
        updateUserListings(snapshot.data().user);
        indexProd.deleteObject(snapshot.id);
      } catch (error) {
        console.log(error);
      }
      return 1;
    });

exports.onUserDelete = functions.firestore
    .document("user/{userId}")
    .onDelete((deletedUser) => {
      // delete all listings belonging to user
      console.log("user deleted listings", deletedUser.data().listings);
      if (deletedUser.data().listings) {
        deletedUser.data().listings.forEach((listing) => {
          firestore.doc("listings/" + listing).delete();
        });
        // delete listing index
        try {
          indexProd.deleteBy({
            filters: "user:" + deletedUser.id,
          });
        } catch (error) {
          console.log("algolia", error);
        }
      }

      try {
      // delete from chat where uid is in users
        const chatRef = firestore.collection("chat");
        chatRef.where("users", "array-contains", deletedUser.id).get().then((querySnapshot) => {
          querySnapshot.forEach((documentSnapshot) => {
            console.log("chat found", documentSnapshot.id);
            const chatId = documentSnapshot.id;
            chatRef.doc(chatId).delete();
          });
        });
      } catch (error) {
        console.log(error);
      }


      try {
        userIndex.deleteObject(deletedUser.id);
      } catch (error) {
        console.log("algolia", error);
      }
      try {
        app.auth().getUser(deletedUser.id).then((user) => {
          console.log("found auth user", user);
          if (user && user.uid) {
          //  console.log(user);
            app.auth().deleteUser(deletedUser.id);
          }
        }, (error)=>{
        // console.log("auth delete", error);
        });
      } catch (error) {
        console.log("auth delete", error);
      }
      // delete from storage
      try {
        const bucket = app.storage().bucket("users/" + deletedUser.id);
        bucket.exists().then((exists) => {
          if (exists.includes(true)) {
            bucket.delete();
          }
        });
      } catch (error) {
        console.log("bucketError", error);
      }

      return 1;
    });

exports.onUserCreate = functions.firestore
    .document("user/{userId}")
    .onCreate((snapshot) => {
      if (snapshot && snapshot.data() && snapshot.data().uid) {
        const userId = snapshot.data().uid;
        const userData = snapshot.data();
        const docRef = firestore.doc("user/" + userId);
        const sessRef = firestore.collection("user/" + userId + "/sessions/");
        if (userData && userData.current_session) {
          sessRef.add({sessions: userData.current_session});
        }
        const rtdbref = rtdb.ref("user/" + userId);
        docRef.update({actionTriggerList: {sent_welcome_message: false}});
        rtdbref.set({status: 1, timestamp: Date.now()});
        userData.objectID = userId;
        try {
          indexProd.saveObject(userData);
        } catch (error) {
          console.log(error);
        }
        const expRef = firestore.collection("user/" + userId + "/wallet_exps/");
        const payRef = firestore.collection("user/" + userId + "/wallet_payments/");
        const txnRef = firestore.collection("user/" + userId + "/wallet_txns/");
        expRef.add({});
        payRef.add({});
        txnRef.add({});
      }
      return 1;
    });

exports.onUserUpdate = functions.firestore
    .document("user/{userId}")
    .onUpdate((snapshot) => {
      if (snapshot.after && snapshot.after.data() &&
       snapshot.after.data().uid) {
        const userId = snapshot.after.data().uid;
        const userData = snapshot.after.data();
        const docRef = firestore.doc("user/" + userId);
        const sessRef = firestore.collection("user/" + userId + "/sessions/");
        // add session to session collection
        if (userData && userData.current_session && userData.relogin) {
          sessRef.add({sessions: userData.current_session});
          docRef.update({relogin: false});
        }
        // update algolia index
        try {
          userData.objectID = userId;
          userIndex.partialUpdateObject(userData, {
            createIfNotExists: true,
          });
        } catch (error) {
          console.log(error);
        }
        console.log("user update");
        if (userData && userData.actionTriggerList && userData.actionTriggerList.sent_welcome_message === false) {
          messaging.triggerWelcomeMessage(userData, userId);
        }
      // messaging.triggerWelcomeMessage(userData, userId);
      }
      return 1;
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
        // if (lastMarkedForNotif) {
        const newNote = {
          "soundNotify": true,
          "image": "{system}",
          "emailInstruction": {
            "template": "message_notification",
            "receipient": null,
          },
          "appSender": environment.appName,
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
          "domain": environment.appDomain,
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


exports.updateAdStatus = functions.pubsub.schedule("every 60 minutes").
    onRun((context)=>{
      // eslint-disable-next-line max-len
      const query = firestore.collection("listings")
          .where("promoActive", "==", true);
      query.get().then((querySnapshot) => {
        querySnapshot.forEach((documentSnapshot) => {
          const data = documentSnapshot.data();
          const id = documentSnapshot.id;
          console.log("checking for docs", data);
          if (data.promoActive === true && data.promotions && (data.promotions || []).length > 0) {
            updateSingleAdStatus(data, id);
          }
        });
      });
      return 1;
    });

const updateSingleAdStatus = (data, id) => {
  if (data.promotions && data.promotions.length) {
    const promotionData = data.promotions && data.promotions[data.promotions.length -1];
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
      firestore.doc("listings/"+id).update({promoActive: false, promotions});
      console.log("updated");
    } else {
      console.log("remainingTenure", remainingTenure);
    }
  // const getUser = fbadmin.firestore.doc("user/"+data.user).get();
  // getUser.then((res) => {
  // const userData = res.data();
  // messaging.sendPromotionReminder(promotionData, data, userData);
  // });
  }
};

exports.syncIndexs = functions.firestore.document("triggers/{uid}").onCreate(
    (snapshot)=>{
      const data = snapshot.data();
      if (data.type = "listings" && data.action === "sync") {
        // get the listing
        firestore.doc("listings/"+data.uid).get().then((res)=>{
          if (!res.exists) {
            console.log("listing not found");
            indexProd.deleteObject(data.uid);
            // remove from triggers
            firestore.doc("triggers/"+data.uid).delete();
          }
        });
      }
      return 1;
    });


exports.createSeller = functions.https.onRequest((request, response) => {
  cors(request, response, () => {
    if (request.method !== "POST") {
      response.status(405).send("Method Not Allowed");
    } else {
      const body = request.body;
      const email = body.credentials.email;
      const password = body.credentials.password;
      const phoneNumber = body.credentials.phoneNumber;
      app.auth().createUser({
        email: email,
        emailVerified: false,
        password: password,
        disabled: false,
      }).then((userRecord) => {
        body.userData.uid = userRecord.uid;
        body.userData.hash = userRecord.uid;
        firestore.doc("user/"+userRecord.uid).set(body.userData);
        app.auth().updateUser(userRecord.uid, {
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
