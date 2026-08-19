// firestore-service.js

/**
 * Replaces localStorage-based data operations with Firebase Firestore.
 * Assumes firebase-config.js has initialized firebase and set window.db and window.auth.
 */

// --- RCA Record Operations ---

/**
 * Sets up a real-time onSnapshot listener on the rcaRecords collection.
 * @param {Function} callback - Called with an array of record objects whenever data changes.
 * @returns {Function} - Unsubscribe function.
 */
window.subscribeToRecords = function(callback) {
  try {
    return window.db.collection('rcaRecords')
      .orderBy('date', 'desc')
      .onSnapshot(
        (snapshot) => {
          const records = [];
          snapshot.forEach((doc) => {
            records.push({ id: doc.id, ...doc.data() });
          });
          callback(records);
        },
        (error) => {
          console.error('Error subscribing to records:', error);
          throw new Error('Failed to subscribe to records: ' + error.message);
        }
      );
  } catch (error) {
    console.error('Failed to initialize records subscription:', error);
    throw error;
  }
};

/**
 * Saves a record to Firestore.
 * @param {Object} record - The RCA record to save.
 * @returns {Promise<Object>} - The saved record.
 */
window.saveRecordToFirestore = async function(record) {
  try {
    if (!record.id) {
      throw new Error('Record must have an id');
    }

    const recordRef = window.db.collection('rcaRecords').doc(record.id);
    const dataToSave = { ...record };

    dataToSave.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    if (!dataToSave.createdAt) {
      dataToSave.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    }

    if (!dataToSave.createdBy) {
      if (typeof window.currentUserEmail === 'function') {
        dataToSave.createdBy = window.currentUserEmail();
      } else if (window.auth && window.auth.currentUser) {
        dataToSave.createdBy = window.auth.currentUser.email;
      }
    }

    await recordRef.set(dataToSave, { merge: true });
    return dataToSave;
  } catch (error) {
    console.error('Error saving record to Firestore:', error);
    throw new Error('Failed to save record: ' + error.message);
  }
};

/**
 * Deletes a record from Firestore by ID.
 * @param {string} id - The ID of the record to delete.
 */
window.deleteRecordFromFirestore = async function(id) {
  try {
    await window.db.collection('rcaRecords').doc(id).delete();
  } catch (error) {
    console.error('Error deleting record from Firestore:', error);
    throw new Error('Failed to delete record: ' + error.message);
  }
};

/**
 * Gets a single record from Firestore by ID.
 * @param {string} id - The ID of the record to retrieve.
 * @returns {Promise<Object|null>} - The record data or null if not found.
 */
window.getRecordFromFirestore = async function(id) {
  try {
    const doc = await window.db.collection('rcaRecords').doc(id).get();
    if (doc.exists) {
      return { id: doc.id, ...doc.data() };
    }
    return null;
  } catch (error) {
    console.error('Error getting record from Firestore:', error);
    throw new Error('Failed to get record: ' + error.message);
  }
};

// --- User Management Operations ---

/**
 * Fetches all user documents from the users collection.
 * @returns {Promise<Array>} - Array of user objects.
 */
window.loadUsers = async function() {
  try {
    const snapshot = await window.db.collection('users').get();
    const users = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      users.push({
        uid: doc.id,
        email: data.email,
        displayName: data.displayName,
        role: data.role,
        createdAt: data.createdAt
      });
    });
    return users;
  } catch (error) {
    console.error('Error loading users:', error);
    throw new Error('Failed to load users: ' + error.message);
  }
};

/**
 * Creates a new user account using a secondary Firebase instance.
 * @param {string} email - User's email.
 * @param {string} password - User's password.
 * @param {string} displayName - User's display name.
 * @param {string} role - User's role.
 * @returns {Promise<Object>} - The created user's data profile.
 */
window.createUserAccount = async function(email, password, displayName, role) {
  let secondaryApp;
  try {
    const firebaseConfig = firebase.app().options;
    secondaryApp = firebase.initializeApp(firebaseConfig, 'Secondary_' + Date.now());
    const secondaryAuth = secondaryApp.auth();

    let uid;

    try {
      // Try to create the account
      const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
      uid = cred.user.uid;
    } catch (createError) {
      if (createError.code === 'auth/email-already-in-use') {
        // Account exists — sign in to get the UID and create the profile
        try {
          const cred = await secondaryAuth.signInWithEmailAndPassword(email, password);
          uid = cred.user.uid;
        } catch (signInError) {
          throw new Error('Account exists but password does not match. Cannot recover profile.');
        }
      } else {
        throw createError;
      }
    }

    const userData = {
      email,
      displayName,
      role,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    await window.db.collection('users').doc(uid).set(userData, { merge: true });
    
    await secondaryAuth.signOut();
    
    return { uid, ...userData };
  } catch (error) {
    console.error('Error creating user account:', error);
    throw new Error('Failed to create user account: ' + error.message);
  } finally {
    if (secondaryApp) {
      secondaryApp.delete().catch((err) => {
        console.error('Error deleting secondary app instance:', err);
      });
    }
  }
};

/**
 * Updates a user's role.
 * @param {string} uid - User's UID.
 * @param {string} role - The new role.
 */
window.updateUserRole = async function(uid, role) {
  try {
    await window.db.collection('users').doc(uid).update({ role });
  } catch (error) {
    console.error('Error updating user role:', error);
    throw new Error('Failed to update user role: ' + error.message);
  }
};

/**
 * Deletes a user profile document from Firestore.
 * @param {string} uid - User's UID.
 */
window.deleteUserProfile = async function(uid) {
  try {
    await window.db.collection('users').doc(uid).delete();
  } catch (error) {
    console.error('Error deleting user profile:', error);
    throw new Error('Failed to delete user profile: ' + error.message);
  }
};

/**
 * Returns a list of users for dropdowns and assignments.
 * @returns {Promise<Array>} - Array of objects with email and displayName.
 */
window.getUsersList = async function() {
  try {
    const snapshot = await window.db.collection('users').get();
    const users = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      users.push({
        email: data.email,
        displayName: data.displayName
      });
    });
    return users;
  } catch (error) {
    console.error('Error getting users list:', error);
    throw new Error('Failed to get users list: ' + error.message);
  }
};
