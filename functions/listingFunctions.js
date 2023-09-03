/* eslint-disable max-len */
const {app} = require("./firebase-init");
const functions = require("firebase-functions");
const algoliaSearch = require("algoliasearch");
const environment = require("./environement");
const util = require("./util");
const firestore = app.firestore();
const client = algoliaSearch(environment.algoliaConfig.app, environment.algoliaConfig.key);
const indexProd = client.initIndex(environment.indexProdName);


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
      // remove if owner does not exists
      try {
        const docRef = firestore.doc("user/"+snapshot.after.data().user);
        docRef.get().then((res) => {
          if (!res.exists) {
            console.log("user not found");
            indexProd.deleteObject(snapshot.after.id);
            // delete from firestore
            firestore.doc("listings/"+snapshot.after.id).delete();
            return 1;
          }
        });
      } catch (error) {
        console.log(error);
      }

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


const updateSingleAdStatus = (data, id) => {
  if (data && data.promotions && data.promotions.length) {
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
