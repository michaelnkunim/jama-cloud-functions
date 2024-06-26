/* eslint-disable max-len */
const {app} = require("./firebase-init");
const axios = require("axios");
const hbs = require("handlebars");
const environment = require("./environement");
const uuid = require("uuid");
const luxon = require("luxon");
const endPoint = "https://jama-api1-lzdsvs7hqq-uc.a.run.app/api";
// eslint-disable-next-line max-len
const FCM_SERVER_KEY= "AAAAQt7SjCM:APA91bE_rrIvj8xGDzgqIE8x-i3EGXkT6qJoUj6RYbPGMWnD3zIfQwkoyUVeg6fHVUu3UH04eG5AefoEGQ6lriPk_7WJ_mdLTQkI_HopgK0HNrAv94VTZMzFXb62HZFz-cP4-I8TZ-zV";
const fcmEndPoint = "https://fcm.googleapis.com/fcm/send";
const firestore = app.firestore();

const processMessageToChannels = (newNote, userId) => {
  // console.log(newNote);
  let userData = {};
  const getUser = firestore.doc("user/"+userId).get();
  getUser.then((res) => {
    userData = res.data();
    const ts = Date.now();
    const dateOb = new Date(ts);
    const date = dateOb.getDate();
    const month = dateOb.getMonth() + 1;
    const year = dateOb.getFullYear();
    const nowDate = year + "-" + month + "-" + date + " " +
      dateOb.getHours() +":"+ dateOb.getMinutes() +":"+ dateOb.getSeconds();
    newNote.dynamicJson.date = new Date().toLocaleString("en-US", {
      timeZone: "Africa/Accra",
    });
    newNote.dynamicJson.time = nowDate;
    const jsonObject = {userData, noteData: newNote.dynamicJson};

    const patchTitleDynamics = hbs.compile(newNote.title);
    newNote.title = patchTitleDynamics(jsonObject);

    const patchContentDynamics = hbs.compile(newNote.content);
    newNote.content = patchContentDynamics(jsonObject);


    // update document with Dynamic data
    const docRef = firestore.doc("user/"+userId+"/notes/"+newNote.uid);
    if (newNote.soundNotify === true) {
      newNote.soundNotified = false;
    }
    // console.log(newNote);
    // console.log(jsonObject);
    // console.log(newNote.emailInstruction.template);
    // newNote.channels.email = false;
    if (newNote.channels.email === true && jsonObject.userData.email) {
      const templatesRef = firestore.collection("system_email_templates");
      const snapshot = templatesRef.where("templateName", "==",
          newNote.emailInstruction.template).get();
      snapshot.then((res) => {
        res.forEach((doc) => {
          const blocksRef = firestore.doc("systemdata/emailBlocks").get();
          blocksRef.then((res) => {
            const blocks = res.data().blocks;
            let blockStructure = res.data().block_structure;

            blocks.forEach((element) => {
              blockStructure =
                blockStructure.
                    replace("[["+element["title"]+"]]", element["markup"]);
            });

            const mailBodyCompiled = hbs.compile(doc.data().markup);
            const mailBody = mailBodyCompiled(jsonObject);

            newNote.mailBody = mailBody;
            newNote.parsedDynamicData = true;

            blockStructure = blockStructure.replace("[[main]]", mailBody);
            const compiledTemplate = hbs.compile(blockStructure);

            const html = compiledTemplate(jsonObject);

            const sendData = {
              "Source": "jama.com.gh@gmail.com",
              "Destination": {
                "ToAddresses": [jsonObject.userData.email],
              },
              "Message": {
                "Subject": {"Data": newNote.title},
                "Body": {"Html": {"Data": html}},
              },
            };
            axios.post(endPoint + "/sendEmail", sendData).then((res) => {
              // console.log(res);
            }, (error) => {
              console.log(error);
            });
            // fs.writeFile('./mailFile.html',mailBody,()=>{
            //   console.log("File Created Successfully");
            // });
          });
        });
      });
    }
    if (newNote.channels.sms === true && userData.phoneNumber) {
      if (newNote.smsMessage) {
        const patchSMSMessage = hbs.compile(newNote.smsMessage);
        newNote.smsMessage = patchSMSMessage(jsonObject);
      }

      const sendData = {
        phoneNumbers: [userData.phoneNumber],
        message: newNote.smsMessage || stripHtmlTags(newNote.content),
        sender_id: "Jama",
      };
      axios.post(endPoint + "/sendSMS", sendData).then((res)=>{
        console.log(res);
      }, (error)=>{
        console.log(error, "error messages");
      });
    }

    const sendPushNotes = (req, uid) => {
      const reqData = req;
      const receipeients = reqData.deviceTokens;
      // console.log(uid);
      receipeients.forEach((receipient) => {
        const sendData = {
          "notification": reqData.notification,
          "data": reqData.notification,
          "to": receipient,
          "tokens": receipient,
          "collapseKey": uid,
          "messageId": uid,
        };
        req.token = receipient;
        axios.post(fcmEndPoint, sendData,
            {headers: {"Authorization": `Bearer ${FCM_SERVER_KEY}`}}).
            then((res_) => {
              // console.log(res_.data);
              // res.json(res_.data);
              console.log("Successfully sent message:");
            }).catch(function(error) {
              console.log("Error sending message:", error);
            });
      });
    };
      // console.log(newNote);

    if (newNote.channels.devicePush == true &&
         userData.deviceNotification &&
        userData.deviceNotification.length > 0) {
      userData.deviceNotification.forEach((element) => {
        // console.log(newNote);
        const sendData = {
          "deviceTokens": [element.token],
          "notification": {
            "title": stripHtmlTags(newNote.title),
            "body": stripHtmlTags(newNote.content),
            "mutable_content": "true",
            "sound": "Tri-tone",
            "click_action": newNote.dynamicJson.dl,
            "priority": "high",
            "badge": "1",
            "icon": newNote.dynamicJson.noteImage ||
              newNote.dynamicJson.senderAvatar,
            "dl": newNote.link,
            "collapseKey": newNote.uid,
            "messageId": newNote.uid,
            "onClick": "",
          },
          "webpush": {
            "fcm_options": {
              "link": newNote.dynamicJson.dl,
            },
          },
        };
        sendPushNotes(sendData, newNote.uid);
      });
    }
    newNote.pushNotified = true;
    docRef.update(newNote);
  });
};


const sendPromotionReminder = (promotionData, listing, user) => {
  user.firstname = user.username.split(" ")[0];
  // const noteData = {promotionData, listing, user};
  // const newNote = {
  //   "soundNotify": true,
  //   "image": "{system}",
  //   "emailInstruction": {
  //     "template": "message_notification",
  //     "receipient": null,
  //   },
  //   "appSender": config.appName,
  //   "isRead": false,
  //   "title": "Your Listing was promoted successfully",
  //   // eslint-disable-next-line max-len
  //   "smsMessage": "Hi "+noteData.user.firstName+",
  // Your item "+listing.title+" was promoted successfully ",
  //   "type": "user",
  //   "content": lastMarkedForNotif.content,
  //   "createdAt": Date.now(),
  //   "actionPhrase": "view",
  //   "channels": lastMarkedForNotif.notifyObject.channels,
  //   "dynamicJson": noteData,
  //   "link": lastMarkedForNotif.noteData.chatUrl,
  //   "domain": appDomain,
  //   "id": uuid.v4(),
  //   "inAppNotified": false,
  //   "dateRead": "",
  //   "soundNotified": false,
  //   "noteGroup": latestData.uid,
  // };
  console.log(promotionData);
  console.log(listing);
};

const triggerWelcomeMessage = (userData, userId) => {
  const notesRef = firestore.collection("user/" + userId + "/notes/");
  const newNote = {
    "soundNotify": true,
    "image": "{system}",
    "emailInstruction": {
      "template": "seller_welcome_note",
      "receipient": null,
    },
    "appSender": environment.appName,
    "isRead": false,
    "title": "Welcome to Jama",
    "smsMessage": "Hi {{noteData.receipientName}}, Welcome to Jama. Click on this link {{noteData.dl}} to view",
    "type": "user",
    "content": "Welcome to Jama",
    "createdAt": Date.now(),
    "actionPhrase": "view",
    "channels": {
      "devicePush": true,
      "email": true,
      "sms": true,
    },
    "dynamicJson": {
      "dl": environment.appDomain,
      "receipientName": userData.username,
      "noteImage": "{system}",
      "senderAvatar": "{system}",
    },
    "link": environment.appDomain,
    "domain": environment.appDomain,
    "id": uuid.v4(),
    "inAppNotified": false,
    "dateRead": "",
    "soundNotified": false,
    "noteGroup": "welcome",
  };
  const docRef = firestore.doc("user/" + userId);
  notesRef.add(newNote);
  const startDay = {
    seconds: 1660738904,
  };

  const time = luxon.DateTime.fromMillis(startDay.seconds * 1000, {zone: "Africa/UTC"}).startOf("day");


  if (userData && userData.actionTriggerList && !userData.actionTriggerList.sent_welcome_message) {
    docRef.update({actionTriggerList: {sent_welcome_message: true}, timestamp: time});
  }
};

const stripHtmlTags = (input) => {
  return input.replace(/<[^>]*>/g, "");
};

module.exports = {processMessageToChannels, sendPromotionReminder, triggerWelcomeMessage};
