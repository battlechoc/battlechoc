import { useCallback, useEffect, useRef, useState } from "react";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import {
  cardanoApi,
  createPasskeyBackup,
  encryptBackup,
  features,
  forgetPasskey,
  keyStore,
  KeyAlreadyStoredError,
  KeyStoreError,
  NetworkMismatchError,
  newRecoveryWords,
  PasskeyCancelledError,
  PasskeyExistsError,
  PasskeyPrfError,
  PasskeyUnknownError,
  passkeySupport,
  saveBackup,
  signChallenge,
  subjectOfWords,
  wordsFromPasskey,
} from "../../cardano";
import { KEYS_CHANGED } from "./ConnectAccount";
import logger from "../../helper/logger";

// The player's keys and what can be done with them (moved out of SaveProgress, 2026-11-12):
// saving makes a Cardano key from 24 new recovery words on the device and links it to the player
// (src/cardano); the words are backed up by writing them down, a passkey or a backup file; once a
// passkey exists, the words open only through it (`guardedWords`). The profile row and its
// dialogs (SaveProgress, AccountSafety, KeepWords) only show this state and call these actions.

// what went wrong while saving, in words a player can act on
const saveError = (failure) => {
  if (failure instanceof NetworkMismatchError) {
    return t(tr.SAVE_ERROR_NETWORK);
  }
  if (failure instanceof KeyStoreError) {
    return t(tr.SAVE_ERROR_STORAGE);
  }
  if (failure && failure.response && failure.response.status === 409) {
    return t(tr.SAVE_PROGRESS_TAKEN);
  }
  return t(tr.SAVE_PROGRESS_FAILED);
};

// what went wrong with a passkey backup, in words a player can act on (none for a closed prompt)
const passkeyError = (failure) => {
  if (failure instanceof PasskeyCancelledError) {
    return null;
  }
  if (failure instanceof PasskeyPrfError) {
    return t(tr.PASSKEY_NO_PRF);
  }
  if (failure instanceof PasskeyUnknownError) {
    return t(tr.PASSKEY_UNKNOWN);
  }
  if (failure instanceof PasskeyExistsError) {
    return t(tr.PASSKEY_EXISTS);
  }
  return t(tr.PASSKEY_FAILED);
};

/**
 * The keys of the player called `playerName`, read when the hook mounts (the profile opens) and
 * whenever ConnectAccount linked a wallet (KEYS_CHANGED).
 */
const useAccountKeys = ({ playerName }) => {
  // the player's linked keys (null while they load or could not be read)
  const [identities, setIdentities] = useState(null);
  // the words on this device and the key they make ("stake:<hash>")
  const [local, setLocal] = useState({
    words: null,
    subject: null,
    methods: [],
  });
  // the player's passkey backups (all keys; null when they could not be read: then the words
  // stay closed) and whether this device can make one
  const [passkeys, setPasskeys] = useState(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const makingPasskey = useRef(false);
  const [canPasskey, setCanPasskey] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // a second tap while saving does nothing (the key store also refuses a second key)
  const saving = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setIdentities(await cardanoApi.identities());
    } catch (failure) {
      logger.warn("could not read the linked keys", failure);
    }
    setPasskeys(await cardanoApi.passkeys().catch(() => null));
    try {
      const words = await keyStore.load();
      setLocal({
        words,
        subject: words ? await subjectOfWords(words) : null,
        methods: await keyStore.backupMethods(),
      });
    } catch (failure) {
      logger.warn("could not read the key on this device", failure);
    }
    setCanPasskey(
      await features.offerPasskey(passkeySupport).catch(() => false)
    );
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // a wallet linked from "I already have an account" (plan 3)
  useEffect(() => {
    window.addEventListener(KEYS_CHANGED, refresh);
    return () => window.removeEventListener(KEYS_CHANGED, refresh);
  }, [refresh]);

  /** Makes and links the key; resolves true once the progress is saved. */
  const save = async () => {
    if (saving.current) {
      return false;
    }
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      let words = await keyStore.load();
      if (!words) {
        words = await newRecoveryWords();
        try {
          await keyStore.save(words);
        } catch (failure) {
          if (!(failure instanceof KeyAlreadyStoredError)) {
            throw failure;
          }
          words = await keyStore.load();
        }
      }
      await signChallenge(words, "link");
      await refresh();
      return true;
    } catch (failure) {
      logger.warn("could not save the progress", failure);
      setError(saveError(failure));
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  /** Removes the key `subject` with a proof by an existing key (ConfirmChange). */
  const remove = async (subject, confirmToken) => {
    await cardanoApi.removeIdentity(subject, confirmToken);
    // the words on this device belonged to that key: they would only link it again
    if (subject === local.subject) {
      await keyStore.clear();
    }
    await refresh();
  };

  /** The words were written down (RecoveryWords' check passed). */
  const backedUp = async () => {
    await keyStore.markBackedUp("words");
    await refresh();
  };

  // the words for a backup or to show: with a passkey only after it (else saving a file or another
  // passkey would hand out the words the passkey guards); closed when the passkeys are unknown
  const guardedWords = async () => {
    if (passkeys === null) {
      throw new PasskeyUnknownError();
    }
    const own = passkeys.filter((passkey) => passkey.subject === local.subject);
    return own.length === 0
      ? local.words
      : wordsFromPasskey(own.map((passkey) => passkey.credentialId));
  };

  const savePasskey = async () => {
    if (makingPasskey.current) {
      return;
    }
    makingPasskey.current = true;
    setPasskeyBusy(true);
    setError(null);
    let backup;
    try {
      const words = await guardedWords();
      backup = await createPasskeyBackup(words, {
        playerName,
        subject: local.subject,
        excludeCredentialIds: passkeys.map((passkey) => passkey.credentialId),
      });
      await cardanoApi.storePasskey(backup);
    } catch (failure) {
      logger.warn("could not save a passkey backup", failure);
      // a passkey made but not kept on the server guards nothing: the password manager drops it
      if (backup) {
        await forgetPasskey(backup.credentialId);
      }
      setError(passkeyError(failure));
    } finally {
      makingPasskey.current = false;
      setPasskeyBusy(false);
    }
    await refresh();
  };

  /** Encrypts the words with `password` and hands the file over (a share sheet on phones). */
  const saveFile = async (password) => {
    try {
      const words = await guardedWords();
      const text = await encryptBackup(words, password);
      const result = await saveBackup(text, { mobile: features.isMobile() });
      if (result !== "cancelled") {
        await keyStore.markBackedUp("file");
      }
    } catch (failure) {
      logger.warn("could not save the backup file", failure);
      setError(
        failure instanceof PasskeyCancelledError
          ? null
          : passkeyError(failure) || t(tr.FILE_SAVE_FAILED)
      );
    }
    await refresh();
  };

  /** The words to show (through the passkey when there is one); null when they stay closed. */
  const openWords = async () => {
    setError(null);
    try {
      return await guardedWords();
    } catch (failure) {
      logger.warn("could not open the words with the passkey", failure);
      setError(
        failure instanceof PasskeyPrfError
          ? t(tr.PASSKEY_CANT_UNLOCK)
          : passkeyError(failure)
      );
      return null;
    }
  };

  return {
    identities,
    local,
    passkeys,
    canPasskey,
    error,
    setError,
    busy,
    passkeyBusy,
    refresh,
    save,
    remove,
    backedUp,
    savePasskey,
    saveFile,
    openWords,
  };
};

export default useAccountKeys;
