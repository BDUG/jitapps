/* Dependency-free Cargo project wrapping the generated browser SPA. */
(function(root){'use strict';
const main=String.raw`use std::env;
use std::io::{self, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::Duration;

const INDEX: &[u8] = include_bytes!("../public/index.html");
const SDK: &[u8] = include_bytes!("../public/appix-sdk.js");

fn route(method: &str, target: &str) -> (u16, &'static str, &'static [u8]) {
    if method != "GET" && method != "HEAD" {
        return (405, "text/plain; charset=utf-8", b"Method not allowed\n");
    }
    if !target.starts_with('/') || target.starts_with("//") {
        return (400, "text/plain; charset=utf-8", b"Invalid request target\n");
    }
    let path = target.split('?').next().unwrap_or("/");
    match path {
        "/" | "/index.html" => (200, "text/html; charset=utf-8", INDEX),
        "/appix-sdk.js" => (200, "application/javascript; charset=utf-8", SDK),
        _ if path.split('/').any(|part| part.starts_with('.') || part.contains('%')) =>
            (404, "text/plain; charset=utf-8", b"Not found\n"),
        _ if !path.rsplit('/').next().unwrap_or("").contains('.') =>
            (200, "text/html; charset=utf-8", INDEX),
        _ => (404, "text/plain; charset=utf-8", b"Not found\n"),
    }
}

fn send(stream: &mut TcpStream, method: &str, status: u16, mime: &str, body: &[u8]) -> io::Result<()> {
    let reason = match status { 200 => "OK", 400 => "Bad Request", 404 => "Not Found", 405 => "Method Not Allowed", 431 => "Request Header Fields Too Large", _ => "Error" };
    write!(stream, "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\n", status, reason, mime, body.len())?;
    if status == 405 { write!(stream, "Allow: GET, HEAD\r\n")?; }
    write!(stream, "\r\n")?;
    if method != "HEAD" { stream.write_all(body)?; }
    stream.flush()
}

fn handle(mut stream: TcpStream) -> io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;
    stream.set_write_timeout(Some(Duration::from_secs(5)))?;
    let mut request = Vec::new();
    let mut buffer = [0_u8; 1024];
    loop {
        let size = stream.read(&mut buffer)?;
        if size == 0 { return Ok(()); }
        request.extend_from_slice(&buffer[..size]);
        if request.len() > 16384 { return send(&mut stream, "GET", 431, "text/plain", b"Request headers too large\n"); }
        if request.windows(4).any(|w| w == b"\r\n\r\n") { break; }
    }
    let text = match std::str::from_utf8(&request) {
        Ok(text) => text,
        Err(_) => return send(&mut stream, "GET", 400, "text/plain", b"Invalid request\n"),
    };
    let parts: Vec<_> = text.lines().next().unwrap_or("").split_whitespace().collect();
    if parts.len() != 3 || !matches!(parts[2], "HTTP/1.0" | "HTTP/1.1") {
        return send(&mut stream, "GET", 400, "text/plain", b"Invalid request line\n");
    }
    let (status, mime, body) = route(parts[0], parts[1]);
    send(&mut stream, parts[0], status, mime, body)
}

fn main() -> io::Result<()> {
    let host = env::var("HOST").unwrap_or_else(|_| "127.0.0.1".into());
    let port: u16 = env::var("PORT").unwrap_or_else(|_| "8080".into()).parse()
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "PORT must be an integer from 0 to 65535"))?;
    let listener = TcpListener::bind((host.as_str(), port))?;
    println!("appiX Rust server listening on http://{}", listener.local_addr()?);
    // A small static server: one bounded-time connection at a time.
    for stream in listener.incoming() {
        match stream { Ok(stream) => { if let Err(error) = handle(stream) { eprintln!("Request failed: {}", error); } }, Err(error) => eprintln!("Accept failed: {}", error) }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn serves_spa_and_routes() {
        assert_eq!(route("GET", "/").2, INDEX);
        assert_eq!(route("GET", "/dashboard/settings?tab=one").2, INDEX);
        assert_eq!(route("GET", "/appix-sdk.js").2, SDK);
        assert_eq!(route("HEAD", "/").0, 200);
    }
    #[test] fn rejects_missing_assets_and_mutations() {
        assert_eq!(route("GET", "/missing.js").0, 404);
        assert_eq!(route("GET", "/Cargo.toml").0, 404);
        assert_eq!(route("GET", "/.env").0, 404);
        assert_eq!(route("GET", "/%2e%2e/private").0, 404);
        assert_eq!(route("POST", "/api/write").0, 405);
        assert_eq!(route("GET", "https://example.test/").0, 400);
    }
}
`;
function files(name){if(!/^[a-z][a-z0-9-]{0,62}$/.test(name))throw Error('Use a lowercase Rust package name with letters, digits and hyphens.');return {'Cargo.toml':'[package]\nname = "'+name+'"\nversion = "0.1.0"\nedition = "2021"\npublish = false\n\n[[bin]]\nname = "appix-server"\npath = "src/main.rs"\n\n[dependencies]\n','src/main.rs':main,'.gitignore':'/target/\n','RUST.md':'# appiX Rust SPA project\n\nThe exported browser UI remains HTML/CSS/JavaScript; Rust serves the bundled SPA. This does not translate UI logic into Rust or provide authentication, a database or a generated API.\n\nInstall Rust/Cargo, then from this directory:\n\n```sh\ncargo test --offline\ncargo run --offline\n# Open http://127.0.0.1:8080\ncargo build --release --offline\n```\n\nThe package uses only the Rust standard library, with no crates to download. Build embeds public/index.html and public/appix-sdk.js in the binary. Rebuild after changing these assets. Native project/SDK/schema files remain available for editing.\n\nHOST defaults to 127.0.0.1 and PORT to 8080. Example: HOST=127.0.0.1 PORT=9090 cargo run --offline. Set HOST=0.0.0.0 only when intentionally serving on your network/container. PowerShell: $env:PORT="9090"; cargo run --offline.\n\nGET/HEAD serve the SPA, embedded SDK and extensionless deep links. Unknown assets return 404; other methods return 405. The server serves no arbitrary filesystem paths and handles one bounded-time connection at a time. It is a small local/deployment starting point, not a production web framework. Use a production HTTP/TLS proxy or replace the server for high-concurrency deployments. Add explicit embedded routes for new local assets. External browser API calls still require the destination API’s CORS policy. Keep credentials on a backend.\n'};}
root.AppixRustExport={files,main};if(typeof module==='object')module.exports=root.AppixRustExport;
})(globalThis);
