import React, { createContext, useContext, ReactNode } from 'react';
import { auth, db } from './firebase';

const FirebaseContext = createContext({ auth, db });

export const FirebaseProvider = ({ children }: { children: ReactNode }) => {
  return (
    <FirebaseContext.Provider value={{ auth, db }}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => useContext(FirebaseContext);
