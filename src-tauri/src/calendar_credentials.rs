use std::sync::Mutex;

static CREDENTIAL_GATE: Mutex<()> = Mutex::new(());

const MAX_SOURCE_ID_LENGTH: usize = 64;
const MAX_CREDENTIAL_SECRET_UTF16_UNITS: usize = 1_280;

pub fn validate_source_id(source_id: &str) -> Result<(), &'static str> {
    if source_id.is_empty()
        || source_id.len() > MAX_SOURCE_ID_LENGTH
        || !source_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err("calendar_source_id_invalid");
    }

    Ok(())
}

fn credential_target(identifier: &str, source_id: &str) -> Result<String, &'static str> {
    validate_source_id(source_id)?;
    if identifier.is_empty() || identifier.len() > 128 {
        return Err("calendar_credential_namespace_invalid");
    }
    Ok(format!("{identifier}/calendar/{source_id}"))
}

#[cfg(windows)]
pub fn store_source_secret(
    identifier: &str,
    source_id: &str,
    secret: &str,
) -> Result<(), &'static str> {
    use std::ptr;

    use windows::{
        core::PWSTR,
        Win32::Security::Credentials::{
            CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
        },
    };

    let _guard = CREDENTIAL_GATE
        .lock()
        .map_err(|_| "calendar_credential_store_unavailable")?;
    let target = credential_target(identifier, source_id)?;
    let mut target_wide = wide_string(&target);
    let mut username_wide = wide_string(identifier);
    let mut secret_wide: Vec<u16> = secret.encode_utf16().collect();
    if secret_wide.len() > MAX_CREDENTIAL_SECRET_UTF16_UNITS {
        secret_wide.fill(0);
        return Err("calendar_credential_too_large");
    }
    let blob_size = secret_wide
        .len()
        .checked_mul(std::mem::size_of::<u16>())
        .and_then(|size| u32::try_from(size).ok())
        .ok_or("calendar_credential_too_large")?;

    let credential = CREDENTIALW {
        Type: CRED_TYPE_GENERIC,
        TargetName: PWSTR(target_wide.as_mut_ptr()),
        CredentialBlobSize: blob_size,
        CredentialBlob: secret_wide.as_mut_ptr().cast::<u8>(),
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        UserName: PWSTR(username_wide.as_mut_ptr()),
        Attributes: ptr::null_mut(),
        ..Default::default()
    };

    let result =
        unsafe { CredWriteW(&credential, 0) }.map_err(|_| "calendar_credential_write_failed");
    secret_wide.fill(0);
    result
}

#[cfg(not(windows))]
pub fn store_source_secret(
    _identifier: &str,
    _source_id: &str,
    _secret: &str,
) -> Result<(), &'static str> {
    Err("calendar_credential_store_unavailable")
}

#[cfg(windows)]
pub fn read_source_secret(identifier: &str, source_id: &str) -> Result<String, &'static str> {
    use std::{ffi::c_void, ptr, slice};

    use windows::{
        core::PCWSTR,
        Win32::Security::Credentials::{CredFree, CredReadW, CREDENTIALW, CRED_TYPE_GENERIC},
    };

    struct CredentialBuffer(*mut CREDENTIALW);

    impl Drop for CredentialBuffer {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe { CredFree(self.0.cast::<c_void>()) };
            }
        }
    }

    let _guard = CREDENTIAL_GATE
        .lock()
        .map_err(|_| "calendar_credential_store_unavailable")?;
    let target = credential_target(identifier, source_id)?;
    let target_wide = wide_string(&target);
    let mut raw_credential: *mut CREDENTIALW = ptr::null_mut();

    unsafe {
        CredReadW(
            PCWSTR(target_wide.as_ptr()),
            CRED_TYPE_GENERIC,
            None,
            &mut raw_credential,
        )
    }
    .map_err(|_| "calendar_credential_missing")?;

    let credential = CredentialBuffer(raw_credential);
    let value = unsafe { &*credential.0 };
    if value.CredentialBlob.is_null() || value.CredentialBlobSize == 0 {
        return Err("calendar_credential_invalid");
    }
    if value.CredentialBlobSize % 2 != 0 {
        return Err("calendar_credential_invalid");
    }

    let units = unsafe {
        slice::from_raw_parts(
            value.CredentialBlob.cast::<u16>(),
            value.CredentialBlobSize as usize / std::mem::size_of::<u16>(),
        )
    };
    String::from_utf16(units).map_err(|_| "calendar_credential_invalid")
}

#[cfg(not(windows))]
pub fn read_source_secret(_identifier: &str, _source_id: &str) -> Result<String, &'static str> {
    Err("calendar_credential_store_unavailable")
}

#[cfg(windows)]
pub fn delete_source_secret(identifier: &str, source_id: &str) -> Result<(), &'static str> {
    use windows::{
        core::{HRESULT, PCWSTR},
        Win32::{
            Foundation::ERROR_NOT_FOUND,
            Security::Credentials::{CredDeleteW, CRED_TYPE_GENERIC},
        },
    };

    let _guard = CREDENTIAL_GATE
        .lock()
        .map_err(|_| "calendar_credential_store_unavailable")?;
    let target = credential_target(identifier, source_id)?;
    let target_wide = wide_string(&target);

    match unsafe { CredDeleteW(PCWSTR(target_wide.as_ptr()), CRED_TYPE_GENERIC, None) } {
        Ok(()) => Ok(()),
        Err(error) if error.code() == HRESULT::from_win32(ERROR_NOT_FOUND.0) => Ok(()),
        Err(_) => Err("calendar_credential_delete_failed"),
    }
}

#[cfg(not(windows))]
pub fn delete_source_secret(_identifier: &str, _source_id: &str) -> Result<(), &'static str> {
    Err("calendar_credential_store_unavailable")
}

#[cfg(windows)]
fn wide_string(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(test)]
mod tests {
    use super::{credential_target, validate_source_id};

    #[test]
    fn accepts_generated_source_ids() {
        assert_eq!(validate_source_id("calendar-a1b2-c3d4"), Ok(()));
        assert_eq!(
            credential_target("com.desktodo.desktop", "calendar-a1b2").unwrap(),
            "com.desktodo.desktop/calendar/calendar-a1b2"
        );
    }

    #[test]
    fn rejects_source_ids_that_can_escape_the_namespace() {
        assert!(validate_source_id("").is_err());
        assert!(validate_source_id("../calendar").is_err());
        assert!(validate_source_id("calendar/source").is_err());
        assert!(validate_source_id(&"a".repeat(65)).is_err());
    }
}
