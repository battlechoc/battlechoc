import { useEffect, useRef } from "react";
import { chainApi } from "../../api/chain";
import { features, signPrepared } from "../../cardano";
import { following, pollOperation } from "./operationPoll";
import { held } from "./held";
import { dropCode, onCode, readCode } from "./signCodes";

// What the minting dialog (MintDialog.jsx) and the salvage of a minted item (SalvageMinted.jsx)
// do alike with the operation they show: one place polls it, this tab's sign code lives as long
// as the flow holds it, and a signature is one attempt whose every outcome names the operation it
// was for. Each flow's reducer takes the events (mintFlow.js, salvageFlow.js); `send(event)`
// passes one to it and answers the new state.

// the operation's states it is followed in by the dialog (one in a block is the watcher's)
const RUNNING = ["prepared", "submitted"];

/**
 * Polls the operation `target` (an id, or null for none) while the dialog shows it: held for the
 * dialog (the watcher leaves it alone), every answer noted and sent as `{ type: "operation" }`,
 * a failure for good as `{ type: "problem", during: "operation" }`; it ends once the operation
 * is in a block or over.
 */
export const useOperationPoll = (target, send) => {
  useEffect(() => {
    if (!target) {
      return undefined;
    }
    const release = following.hold(target);
    const stop = pollOperation({
      fetch: () => held(chainApi.operation(target)),
      onAnswer: (operation) => {
        following.note(operation);
        send({ type: "operation", operation });
      },
      onFailure: (failure) =>
        send({ type: "problem", failure, during: "operation" }),
      ended: (operation) => !operation || !RUNNING.includes(operation.state),
    });
    return () => {
      stop();
      release();
    };
  }, [target, send]);
};

/**
 * This tab's sign code of the flow's operation (`state`: { signCode, operationId, operation }):
 * dropped when the flow lets go of it (signed, ended, no longer taken, or the flow left the
 * operation), kept when the dialog closes; for a prepared operation learned without its code
 * (the dialog was closed while the prepare was out, then opened again), the code this tab kept,
 * now or when the prepare's answer arrives, as `{ type: "signCode" }`.
 */
export const useSignCode = (state, send) => {
  const signCode = state ? state.signCode : null;
  const operationId = state ? state.operationId : null;
  const heldCode = useRef(null);
  useEffect(() => {
    const holding = signCode && operationId ? operationId : null;
    if (heldCode.current && heldCode.current !== holding) {
      dropCode(heldCode.current);
    }
    heldCode.current = holding;
  }, [signCode, operationId]);

  const learned =
    state && state.operation && state.operation.state === "prepared"
      ? state.operation.id
      : null;
  useEffect(() => {
    if (!learned || signCode) {
      return undefined;
    }
    const code = readCode(learned);
    if (code) {
      send({ type: "signCode", operationId: learned, signCode: code });
      return undefined;
    }
    return onCode((id, kept) => {
      if (id === learned) {
        send({ type: "signCode", operationId: id, signCode: kept });
      }
    });
  }, [learned, signCode, send]);
};

/**
 * One signature of the prepared operation `operationId` with this tab's `code`: the injected
 * wallet `name` connected (`apiOf(name)`), the sign info read, the wallet's signature
 * (signPrepared: its checks, the address proof where needed), the witness posted. Its answer goes
 * to the flow as `{ type: "signed", answer }`; every failure as `{ type: "problem", failure,
 * during ("connect", "sign" or "submit"), wallet: `other` (the wallet's name when it is not the
 * flow's own), operationId }`, so a late one of an operation the flow left is dropped.
 */
export const signOperation = async ({
  apiOf,
  name,
  code,
  operationId,
  other,
  send,
}) => {
  let api;
  try {
    api = await apiOf(name);
  } catch (failure) {
    send({
      type: "problem",
      failure,
      during: "connect",
      wallet: other,
      operationId,
    });
    return;
  }
  let signed;
  try {
    const info = await held(chainApi.signInfo(code));
    signed = await signPrepared(api, {
      api: chainApi,
      code,
      info,
      network: features.network(),
    });
  } catch (failure) {
    send({
      type: "problem",
      failure,
      during: "sign",
      wallet: other,
      operationId,
    });
    return;
  }
  try {
    const answer = await held(chainApi.sign(code, signed.witness));
    send({ type: "signed", answer });
  } catch (failure) {
    send({
      type: "problem",
      failure,
      during: "submit",
      wallet: other,
      operationId,
    });
  }
};
