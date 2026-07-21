import CryptoKit
import ExpoModulesCore
import Security

private struct SecureSignerPublicKey: Record {
  @Field var alias = ""
  @Field var crv = "P-256"
  @Field var hardwareBacked = false
  @Field var kty = "EC"
  @Field var x = ""
  @Field var y = ""
}

public final class VibePadSecureSignerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VibePadSecureSigner")

    AsyncFunction("getOrCreateKeyAsync") { (alias: String) -> SecureSignerPublicKey in
      try self.validateAlias(alias)
      let key = try self.loadPrivateKey(alias: alias) ?? self.createPrivateKey(alias: alias)
      return try self.publicKeyRecord(alias: alias, privateKey: key)
    }

    AsyncFunction("signAsync") { (alias: String, signingInput: String) -> String in
      try self.validateAlias(alias)
      guard let key = try self.loadPrivateKey(alias: alias) else {
        throw Exception(
          name: "SecureSignerKeyNotFound",
          description: "No VibePad signing key exists for this installation."
        )
      }
      var signingError: Unmanaged<CFError>?
      guard let derSignature = SecKeyCreateSignature(
        key,
        .ecdsaSignatureMessageX962SHA256,
        Data(signingInput.utf8) as CFData,
        &signingError
      ) as Data? else {
        throw self.securityException(
          name: "SecureSignerSigningFailed",
          fallback: "The Secure Enclave could not sign the DPoP proof.",
          error: signingError
        )
      }
      do {
        let signature = try P256.Signing.ECDSASignature(derRepresentation: derSignature)
        return self.base64Url(signature.rawRepresentation)
      } catch {
        throw Exception(
          name: "SecureSignerInvalidSignature",
          description: "The Secure Enclave returned an invalid P-256 signature."
        )
      }
    }

    AsyncFunction("deleteKeyAsync") { (alias: String) in
      try self.validateAlias(alias)
      let status = SecItemDelete(self.keyQuery(alias: alias) as CFDictionary)
      if status != errSecSuccess && status != errSecItemNotFound {
        throw Exception(
          name: "SecureSignerDeleteFailed",
          description: "The VibePad signing key could not be removed (OSStatus \(status))."
        )
      }
    }
  }

  private func base64Url(_ data: Data) -> String {
    data.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }

  private func createPrivateKey(alias: String) throws -> SecKey {
    var accessError: Unmanaged<CFError>?
    guard let accessControl = SecAccessControlCreateWithFlags(
      nil,
      kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
      .privateKeyUsage,
      &accessError
    ) else {
      throw securityException(
        name: "SecureSignerAccessControlFailed",
        fallback: "The VibePad key access policy could not be created.",
        error: accessError
      )
    }

    let privateAttributes: [CFString: Any] = [
      kSecAttrAccessControl: accessControl,
      kSecAttrApplicationTag: keyTag(alias: alias),
      kSecAttrIsPermanent: true,
    ]
    var attributes: [CFString: Any] = [
      kSecAttrKeySizeInBits: 256,
      kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom,
      kSecPrivateKeyAttrs: privateAttributes,
    ]
#if !targetEnvironment(simulator)
    attributes[kSecAttrTokenID] = kSecAttrTokenIDSecureEnclave
#endif

    var creationError: Unmanaged<CFError>?
    guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, &creationError) else {
      throw securityException(
        name: "SecureSignerKeyCreationFailed",
        fallback: "The VibePad device-bound signing key could not be created.",
        error: creationError
      )
    }
    return key
  }

  private func hardwareBacked(_ key: SecKey) -> Bool {
    guard let attributes = SecKeyCopyAttributes(key) as? [CFString: Any] else {
      return false
    }
    return (attributes[kSecAttrTokenID] as? String) == (kSecAttrTokenIDSecureEnclave as String)
  }

  private func keyQuery(alias: String) -> [CFString: Any] {
    [
      kSecAttrApplicationTag: keyTag(alias: alias),
      kSecAttrKeyClass: kSecAttrKeyClassPrivate,
      kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom,
      kSecClass: kSecClassKey,
    ]
  }

  private func keyTag(alias: String) -> Data {
    Data("studio.peacockery.vibepad.dpop.\(alias)".utf8)
  }

  private func loadPrivateKey(alias: String) throws -> SecKey? {
    var query = keyQuery(alias: alias)
    query[kSecReturnRef] = true
    query[kSecMatchLimit] = kSecMatchLimitOne
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecItemNotFound {
      return nil
    }
    guard status == errSecSuccess, let key = item as! SecKey? else {
      throw Exception(
        name: "SecureSignerKeyLookupFailed",
        description: "The VibePad signing key could not be loaded (OSStatus \(status))."
      )
    }
    return key
  }

  private func publicKeyRecord(alias: String, privateKey: SecKey) throws -> SecureSignerPublicKey {
    guard let publicKey = SecKeyCopyPublicKey(privateKey) else {
      throw Exception(
        name: "SecureSignerPublicKeyFailed",
        description: "The public half of the VibePad signing key is unavailable."
      )
    }
    var exportError: Unmanaged<CFError>?
    guard let external = SecKeyCopyExternalRepresentation(publicKey, &exportError) as Data? else {
      throw securityException(
        name: "SecureSignerPublicKeyExportFailed",
        fallback: "The public half of the VibePad signing key could not be read.",
        error: exportError
      )
    }
    guard external.count == 65, external.first == 0x04 else {
      throw Exception(
        name: "SecureSignerInvalidPublicKey",
        description: "The VibePad signing key is not an uncompressed P-256 key."
      )
    }
    let record = SecureSignerPublicKey()
    record.alias = alias
    record.hardwareBacked = hardwareBacked(privateKey)
    record.x = base64Url(external.subdata(in: 1..<33))
    record.y = base64Url(external.subdata(in: 33..<65))
    return record
  }

  private func securityException(
    name: String,
    fallback: String,
    error: Unmanaged<CFError>?
  ) -> Exception {
    let description = error?.takeRetainedValue().localizedDescription ?? fallback
    return Exception(name: name, description: description)
  }

  private func validateAlias(_ alias: String) throws {
    let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "._-"))
    guard !alias.isEmpty,
      alias.utf8.count <= 160,
      alias.unicodeScalars.allSatisfy({ allowed.contains($0) }) else {
      throw Exception(
        name: "SecureSignerInvalidAlias",
        description: "The VibePad signing key alias is invalid."
      )
    }
  }
}
