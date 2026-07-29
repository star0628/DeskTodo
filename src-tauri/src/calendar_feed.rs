use std::time::Duration;

use futures_util::StreamExt;
use reqwest::{
    header::{
        HeaderMap, HeaderValue, ACCEPT, ETAG, IF_MODIFIED_SINCE, IF_NONE_MATCH, LAST_MODIFIED,
        LOCATION, RETRY_AFTER,
    },
    redirect::Policy,
    Client, StatusCode,
};
use serde::Serialize;
use url::Url;

const MAX_CALENDAR_BYTES: usize = 5 * 1024 * 1024;
const MAX_CALENDAR_URL_UTF16_UNITS: usize = 1_200;
const MAX_REDIRECTS: usize = 3;
const MAX_VALIDATOR_LENGTH: usize = 1024;
const MAX_RETRY_AFTER_SECONDS: u64 = 60 * 60;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AppleCalendarRegion {
    Global,
    ChinaMainland,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AppleCalendarFeedKind {
    Published,
    Holiday,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarCommandError {
    code: &'static str,
    message: &'static str,
}

impl CalendarCommandError {
    pub fn new(code: &'static str, message: &'static str) -> Self {
        Self { code, message }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarFetchResponse {
    status: &'static str,
    content: Option<String>,
    etag: Option<String>,
    last_modified: Option<String>,
    region: AppleCalendarRegion,
    kind: AppleCalendarFeedKind,
    retry_after_seconds: Option<u64>,
    error_code: Option<&'static str>,
}

impl CalendarFetchResponse {
    fn modified(
        content: String,
        headers: &HeaderMap,
        region: AppleCalendarRegion,
        kind: AppleCalendarFeedKind,
    ) -> Self {
        Self {
            status: "modified",
            content: Some(content),
            etag: safe_header(headers, ETAG),
            last_modified: safe_header(headers, LAST_MODIFIED),
            region,
            kind,
            retry_after_seconds: None,
            error_code: None,
        }
    }

    fn not_modified(
        headers: &HeaderMap,
        region: AppleCalendarRegion,
        kind: AppleCalendarFeedKind,
    ) -> Self {
        Self {
            status: "notModified",
            content: None,
            etag: safe_header(headers, ETAG),
            last_modified: safe_header(headers, LAST_MODIFIED),
            region,
            kind,
            retry_after_seconds: None,
            error_code: None,
        }
    }

    fn remote_error(
        status: &'static str,
        error_code: &'static str,
        headers: &HeaderMap,
        region: AppleCalendarRegion,
        kind: AppleCalendarFeedKind,
    ) -> Self {
        Self {
            status,
            content: None,
            etag: None,
            last_modified: None,
            region,
            kind,
            retry_after_seconds: parse_retry_after(headers),
            error_code: Some(error_code),
        }
    }
}

pub async fn fetch_public_calendar(
    raw_url: &str,
    etag: Option<&str>,
    last_modified: Option<&str>,
) -> Result<CalendarFetchResponse, CalendarCommandError> {
    let (initial_url, initial_region, initial_kind) = normalize_apple_public_calendar_url(raw_url)?;
    let client = Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(6))
        .timeout(REQUEST_TIMEOUT)
        .user_agent("DeskTodo/0.6 AppleCalendarReader")
        .build()
        .map_err(|_| {
            CalendarCommandError::new("calendar_client_unavailable", "无法初始化安全日历连接。")
        })?;

    let mut current_url = initial_url;
    for redirect_count in 0..=MAX_REDIRECTS {
        let mut request = client
            .get(current_url.clone())
            .header(ACCEPT, "text/calendar, text/plain;q=0.9");
        if let Some(value) = safe_request_header(etag) {
            request = request.header(IF_NONE_MATCH, value);
        }
        if let Some(value) = safe_request_header(last_modified) {
            request = request.header(IF_MODIFIED_SINCE, value);
        }

        let response = request.send().await.map_err(|_| {
            CalendarCommandError::new(
                "calendar_network_error",
                "无法连接 Apple 日历，请稍后重试。",
            )
        })?;
        let status = response.status();

        if status.is_redirection() {
            if redirect_count == MAX_REDIRECTS {
                return Err(CalendarCommandError::new(
                    "calendar_redirect_limit",
                    "Apple 日历重定向次数过多。",
                ));
            }
            let location = response
                .headers()
                .get(LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| {
                    CalendarCommandError::new(
                        "calendar_redirect_invalid",
                        "Apple 日历返回了无效重定向。",
                    )
                })?;
            let redirected = current_url.join(location).map_err(|_| {
                CalendarCommandError::new(
                    "calendar_redirect_invalid",
                    "Apple 日历返回了无效重定向。",
                )
            })?;
            let (validated, _, _) = normalize_apple_public_calendar_url(redirected.as_str())?;
            current_url = validated;
            continue;
        }

        if status == StatusCode::NOT_MODIFIED {
            return Ok(CalendarFetchResponse::not_modified(
                response.headers(),
                initial_region,
                initial_kind,
            ));
        }
        if status == StatusCode::TOO_MANY_REQUESTS {
            return Ok(CalendarFetchResponse::remote_error(
                "retryableError",
                "calendar_rate_limited",
                response.headers(),
                initial_region,
                initial_kind,
            ));
        }
        if status == StatusCode::UNAUTHORIZED
            || status == StatusCode::FORBIDDEN
            || status == StatusCode::NOT_FOUND
            || status == StatusCode::GONE
        {
            return Ok(CalendarFetchResponse::remote_error(
                "invalid",
                "calendar_link_invalid",
                response.headers(),
                initial_region,
                initial_kind,
            ));
        }
        if status.is_server_error() {
            return Ok(CalendarFetchResponse::remote_error(
                "retryableError",
                "calendar_server_error",
                response.headers(),
                initial_region,
                initial_kind,
            ));
        }
        if status != StatusCode::OK {
            return Ok(CalendarFetchResponse::remote_error(
                "retryableError",
                "calendar_http_error",
                response.headers(),
                initial_region,
                initial_kind,
            ));
        }

        if response
            .content_length()
            .is_some_and(|length| length > MAX_CALENDAR_BYTES as u64)
        {
            return Err(CalendarCommandError::new(
                "calendar_too_large",
                "Apple 日历内容超过 5 MB 安全限制。",
            ));
        }

        let headers = response.headers().clone();
        let mut stream = response.bytes_stream();
        let mut bytes = Vec::new();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|_| {
                CalendarCommandError::new("calendar_network_error", "读取 Apple 日历时连接中断。")
            })?;
            if bytes.len().saturating_add(chunk.len()) > MAX_CALENDAR_BYTES {
                return Err(CalendarCommandError::new(
                    "calendar_too_large",
                    "Apple 日历内容超过 5 MB 安全限制。",
                ));
            }
            bytes.extend_from_slice(&chunk);
        }

        let content = String::from_utf8(bytes).map_err(|_| {
            CalendarCommandError::new(
                "calendar_encoding_invalid",
                "Apple 日历不是有效的 UTF-8 文本。",
            )
        })?;
        let content = content.strip_prefix('\u{feff}').unwrap_or(&content);
        if !content.trim_start().starts_with("BEGIN:VCALENDAR")
            || !content.trim_end().ends_with("END:VCALENDAR")
        {
            return Err(CalendarCommandError::new(
                "calendar_format_invalid",
                "链接没有返回有效的 Apple 日历。",
            ));
        }

        return Ok(CalendarFetchResponse::modified(
            content.to_owned(),
            &headers,
            initial_region,
            initial_kind,
        ));
    }

    Err(CalendarCommandError::new(
        "calendar_network_error",
        "无法读取 Apple 日历。",
    ))
}

pub fn normalize_apple_public_calendar_url(
    raw_url: &str,
) -> Result<(Url, AppleCalendarRegion, AppleCalendarFeedKind), CalendarCommandError> {
    if raw_url.encode_utf16().count() > MAX_CALENDAR_URL_UTF16_UNITS {
        return Err(invalid_link_error());
    }

    let trimmed = raw_url.trim();
    let normalized = trimmed
        .get(0.."webcal://".len())
        .filter(|prefix| prefix.eq_ignore_ascii_case("webcal://"))
        .map(|_| format!("https://{}", &trimmed["webcal://".len()..]))
        .unwrap_or_else(|| trimmed.to_owned());
    let url = Url::parse(&normalized).map_err(|_| invalid_link_error())?;
    if url.scheme() != "https" {
        return Err(invalid_link_error());
    }
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.port().is_some_and(|port| port != 443)
    {
        return Err(invalid_link_error());
    }

    let host = url.host_str().ok_or_else(invalid_link_error)?;
    let lower_path = url.path().to_ascii_lowercase();
    if lower_path.contains("%2f") || lower_path.contains("%5c") {
        return Err(invalid_link_error());
    }
    let segments: Vec<&str> = url
        .path_segments()
        .ok_or_else(invalid_link_error)?
        .collect();
    if let Some(region) = classify_published_host(host) {
        if segments.len() != 3
            || segments[0] != "published"
            || segments[1] != "2"
            || segments[2].len() < 16
            || segments[2].len() > 1024
            || segments[2] == "."
            || segments[2] == ".."
            || segments[2].chars().any(char::is_control)
        {
            return Err(invalid_link_error());
        }
        return Ok((url, region, AppleCalendarFeedKind::Published));
    }

    if host.eq_ignore_ascii_case("calendars.icloud.com")
        && segments.len() == 2
        && segments[0].eq_ignore_ascii_case("holidays")
        && is_holiday_filename(segments[1])
    {
        return Ok((
            url,
            AppleCalendarRegion::Global,
            AppleCalendarFeedKind::Holiday,
        ));
    }

    Err(invalid_link_error())
}

fn classify_published_host(host: &str) -> Option<AppleCalendarRegion> {
    fn valid_node(value: &str) -> bool {
        value
            .strip_prefix('p')
            .and_then(|value| value.strip_suffix("-caldav"))
            .is_some_and(|digits| {
                (1..=6).contains(&digits.len()) && digits.bytes().all(|byte| byte.is_ascii_digit())
            })
    }

    let host = host.to_ascii_lowercase();
    if let Some(node) = host.strip_suffix(".icloud.com.cn") {
        return valid_node(node).then_some(AppleCalendarRegion::ChinaMainland);
    }
    if let Some(node) = host.strip_suffix(".icloud.com") {
        return valid_node(node).then_some(AppleCalendarRegion::Global);
    }
    None
}

fn is_holiday_filename(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 9 || !bytes[5..].eq_ignore_ascii_case(b".ics") {
        return false;
    }
    bytes[2] == b'_'
        && bytes[..2].iter().all(u8::is_ascii_alphabetic)
        && bytes[3..5].iter().all(u8::is_ascii_alphabetic)
}

fn invalid_link_error() -> CalendarCommandError {
    CalendarCommandError::new("calendar_link_invalid", "请输入有效的 Apple 公共日历链接。")
}

fn safe_request_header(value: Option<&str>) -> Option<HeaderValue> {
    let value = value?.trim();
    if value.is_empty() || value.len() > MAX_VALIDATOR_LENGTH {
        return None;
    }
    HeaderValue::from_str(value).ok()
}

fn safe_header(headers: &HeaderMap, name: reqwest::header::HeaderName) -> Option<String> {
    let value = headers.get(name)?.to_str().ok()?.trim();
    if value.is_empty() || value.len() > MAX_VALIDATOR_LENGTH {
        return None;
    }
    Some(value.to_owned())
}

fn parse_retry_after(headers: &HeaderMap) -> Option<u64> {
    headers
        .get(RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.trim().parse::<u64>().ok())
        .map(|seconds| seconds.min(MAX_RETRY_AFTER_SECONDS))
}

#[cfg(test)]
mod tests {
    use super::{normalize_apple_public_calendar_url, AppleCalendarFeedKind, AppleCalendarRegion};

    const TOKEN: &str = "dummy_test_token_0123456789";

    #[test]
    fn accepts_global_and_china_apple_public_links() {
        let (global, global_region, global_kind) = normalize_apple_public_calendar_url(&format!(
            "webcal://p12-caldav.icloud.com/published/2/{TOKEN}"
        ))
        .unwrap();
        assert_eq!(global.scheme(), "https");
        assert_eq!(global_region, AppleCalendarRegion::Global);
        assert_eq!(global_kind, AppleCalendarFeedKind::Published);
        assert!(normalize_apple_public_calendar_url(&format!(
            "WEBCAL://p12-caldav.icloud.com/published/2/{TOKEN}"
        ))
        .is_ok());

        let (_, china_region, china_kind) = normalize_apple_public_calendar_url(&format!(
            "https://p236-caldav.icloud.com.cn/published/2/{TOKEN}"
        ))
        .unwrap();
        assert_eq!(china_region, AppleCalendarRegion::ChinaMainland);
        assert_eq!(china_kind, AppleCalendarFeedKind::Published);
    }

    #[test]
    fn accepts_official_global_holiday_feeds() {
        for value in [
            "https://calendars.icloud.com/holidays/cn_zh.ics",
            "https://calendars.icloud.com/holidays/us_en.ics",
            "webcal://calendars.icloud.com/holidays/jp_ja.ics",
            "https://calendars.icloud.com/HOLIDAYS/GB_EN.ICS",
        ] {
            let (_, region, kind) = normalize_apple_public_calendar_url(value).unwrap();
            assert_eq!(region, AppleCalendarRegion::Global);
            assert_eq!(kind, AppleCalendarFeedKind::Holiday);
        }
    }

    #[test]
    fn rejects_lookalike_hosts_and_unsafe_url_parts() {
        let invalid = [
            format!("http://p12-caldav.icloud.com/published/2/{TOKEN}"),
            format!("https://p12-caldav.icloud.com.evil.example/published/2/{TOKEN}"),
            format!("https://user@p12-caldav.icloud.com/published/2/{TOKEN}"),
            format!("https://p12-caldav.icloud.com:444/published/2/{TOKEN}"),
            format!("https://p12-caldav.icloud.com/published/2/{TOKEN}?copy=1"),
            format!("https://p12-caldav.icloud.com/published/2/{TOKEN}/extra"),
            format!("https://p12-caldav.icloud.com/published/2/%2F{TOKEN}"),
            format!("https://p12-caldav.icloud.com./published/2/{TOKEN}"),
            "https://calendars.icloud.com/holidays/cn_zh.ics?download=1".to_owned(),
            "https://calendars.icloud.com/holidays/cn_zh.ics/extra".to_owned(),
            "https://calendars.icloud.com/holidays/cn-zh.ics".to_owned(),
            "https://calendars.icloud.com/holidays/cnn_zh.ics".to_owned(),
            "https://calendars.icloud.com/holidays/%63n_zh.ics".to_owned(),
            "https://calendars.icloud.com.evil.example/holidays/cn_zh.ics".to_owned(),
        ];

        for value in invalid {
            assert!(normalize_apple_public_calendar_url(&value).is_err());
        }
    }
}
