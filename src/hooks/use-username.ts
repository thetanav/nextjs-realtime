import { nanoid } from "nanoid";

const ANIMALS = ["wolf", "hawk", "bear", "shark", "eagle", "lion", "tiger"];
const STORAGE_KEY = "chat_username";

export const generateUsername = () => {
  const word = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${word}-${nanoid(5)}`;
};

export const storeUsername = (username: string) => {
  localStorage.setItem(STORAGE_KEY, username);
};

export const getUsername = () => {
  const storedUsername = localStorage.getItem(STORAGE_KEY);
  if (storedUsername?.trim() != "") return storedUsername;
  return null;
};
