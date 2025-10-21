import type { LitActionExample } from "../types";

const code = String.raw`// Purpose: Sign an arbitrary message hash as the current Lit Action,
// derive the Action's public key deterministically from its IPFS CID,
// optionally verify the signature, and return everything in the response.

const { sigName, toSign } = jsParams; // 'publicKey' not required; we derive it from the Action IPFS CID
const { keccak256, arrayify } = ethers.utils;

(async () => {
  // 1) Produce a 32-byte hash of the input (Lit Actions expect a 32-byte message for ECDSA schemes)
  const msgBytes = new TextEncoder().encode(toSign);
  const msgHashHex = keccak256(msgBytes);       // 0x-prefixed hex string
  const msgHashBytes = arrayify(msgHashHex);    // Uint8Array

  // 2) Sign as the current Lit Action (deterministic Action identity, not a PKP)
  //    Supported schemes include 'EcdsaK256Sha256' (secp256k1) among others.
  const signingScheme = 'EcdsaK256Sha256';
  const signature = await Lit.Actions.signAsAction({
    toSign: msgHashBytes,
    sigName,
    signingScheme,
  });

  // 3) Derive this Action's public key deterministically from its IPFS CID + scheme
  //    This does not require a PKP and is always the same for a given (CID, scheme).
  const actionIpfsCid = Lit.Auth.actionIpfsIdStack[0];
  const actionPublicKey = await Lit.Actions.getActionPublicKey({
    signingScheme,
    actionIpfsCid,
  });

  // 4) (Optional) Verify that the signature was produced by this Action identity
  const verified = await Lit.Actions.verifyActionSignature({
    signingScheme,
    actionIpfsCid,
    toSign: msgHashBytes,
    signOutput: signature,
  });

  // 5) Return a structured response for clients to consume
  Lit.Actions.setResponse({
    response: JSON.stringify({
      sigName,
      signingScheme,
      message: toSign,
      messageHash: msgHashHex,
      signature,          // string; format depends on scheme
      actionPublicKey,    // string; hex or JSON depending on scheme
      verified,           // boolean
    }),
  });
})();`;

export default {
  id: "sign-as-action",
  title: "Sign as Lit Action",
  description:
    "Hash a message, sign using the Action identity (no PKP required), derive the Action public key, optionally verify the signature, and return structured output.",
  order: 15,
  code,
  jsParams: {
    sigName: "sig1",
    toSign: "Hello from Deterministic Lit Action",
  },
} satisfies LitActionExample;
