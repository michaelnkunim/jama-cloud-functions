/* eslint-disable max-len */
const {app} = require("./firebase-init");
const functions = require("firebase-functions");
const algoliaSearch = require("algoliasearch");
const messaging = require("./messaging");
const cors = require("cors")({origin: true});
const environment = require("./environement");
const firestore = app.firestore();
const rtdb = app.database();
const client = algoliaSearch(environment.algoliaConfig.app, environment.algoliaConfig.key);
const userIndex = client.initIndex(environment.userIndexName);
const indexProd = client.initIndex(environment.indexProdName);


exports.onUserDelete = functions.firestore
    .document("user/{userId}")
    .onDelete((deletedUser) => {
      const userId = deletedUser.id;
      const userData = deletedUser.data();
      // delete all listings belonging to user
      console.log("user deleted listings", userData.listings);
      if (userData.listings) {
        deletedUser.data().listings.forEach((listing) => {
          firestore.doc("listings/" + listing).delete();
        });
        // delete listing index
        try {
          indexProd.deleteBy({
            filters: "user:" + userId,
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
        userIndex.deleteObject(userId);
      } catch (error) {
        console.log("algolia", error);
      }
      try {
        app.auth().getUser(userId).then((user) => {
          console.log("found auth user", user);
          if (user && user.uid) {
          //  console.log(user);
            app.auth().deleteUser(userId);
          }
        }, (error)=>{
        // console.log("auth delete", error);
        });
      } catch (error) {
        console.log("auth delete", error);
      }
      // delete from storage
      try {
        const bucket = app.storage().bucket("users/" + userId);
        bucket.exists().then((exists) => {
          if (exists.includes(true)) {
            bucket.delete();
          }
        });
      } catch (error) {
        console.log("bucketError", error);
      }

      // delete all subdocs
      try {
        const sessRef = firestore.collection("user/" + userId + "/sessions/");
        const noteRef = firestore.collection("user/" + userId + "/notes/");
        sessRef.get().then((querySnapshot) => {
          querySnapshot.forEach((documentSnapshot) => {
            console.log("delete session found", documentSnapshot.id);
            const sessionId = documentSnapshot.id;
            sessRef.doc(sessionId).delete();
          });
        });
        noteRef.get().then((querySnapshot) => {
          querySnapshot.forEach((documentSnapshot) => {
            console.log("delete note found", documentSnapshot.id);
            const noteId = documentSnapshot.id;
            noteRef.doc(noteId).delete();
          });
        });
      } catch (error) {
        console.log(error);
      }
      removePaymentInfo(userId);
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
        if (userData && userData.actionTriggerList && userData.actionTriggerList.sent_welcome_message === false) {
          messaging.triggerWelcomeMessage(userData, userId);
        }
        this.syncUserChats(userData);
        console.log("user update", userId);
      // messaging.triggerWelcomeMessage(userData, userId);
      }
      return 1;
    });

// update user chats if chat does not exist
exports.syncUserChats = (user) => {
  try {
    const chatRef = firestore.collection("chat");
    // remove from user chat list if chat does not exist
    user.chats && user.chats.forEach((chat) => {
      chatRef.doc(chat).get().then((res) => {
        if (!res.exists) {
          console.log("chat not found", chat);
          const chats = user.chats.filter((i) => i !== chat);
          firestore.doc("user/"+user.uid).update({chats});
        }
      });
    });
    // delete from user chatsUsers if user does not exist
    user.chatsUsers && user.chatsUsers.forEach((chatUser) => {
      firestore.doc("user/"+chatUser).get().then((res) => {
        if (!res.exists) {
          console.log("chat user not found", chatUser);
          const chatsUsers = user.chatsUsers.filter((i) => i !== chatUser);
          firestore.doc("user/"+user.uid).update({chatsUsers});
        }
      });
    });
  } catch (error) {
    console.log(error);
  }
};

const removePaymentInfo = (userId) => {
// delete user/userId/wallet_payments
  try {
    const payRef = firestore.collection("user/" + userId + "/wallet_payments/");
    payRef.get().then((querySnapshot) => {
      querySnapshot.forEach((documentSnapshot) => {
        console.log("wallet_payments found", documentSnapshot.id);
        const payId = documentSnapshot.id;
        payRef.doc(payId).delete();
      });
    });
  } catch (error) {
    console.log(error);
  }
  // delete user/userId/wallet_txns
  try {
    const txnRef = firestore.collection("user/" + userId + "/wallet_txns/");
    txnRef.get().then((querySnapshot) => {
      querySnapshot.forEach((documentSnapshot) => {
        console.log("wallet_txns found", documentSnapshot.id);
        const txnId = documentSnapshot.id;
        txnRef.doc(txnId).delete();
      });
    });
  } catch (error) {
    console.log(error);
  }
  // delete user/userId/wallet_exps};
  try {
    const expRef = firestore.collection("user/" + userId + "/wallet_exps/");
    expRef.get().then((querySnapshot) => {
      querySnapshot.forEach((documentSnapshot) => {
        console.log("wallet_exps found", documentSnapshot.id);
        const expId = documentSnapshot.id;
        expRef.doc(expId).delete();
      });
    });
  } catch (error) {
    console.log(error);
  }
};


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

