import http.server
import socketserver
import os

PORT = 8003

# Get the current directory
current_dir = os.getcwd()

# Create a simple HTTP server

class MyHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Log the request
        print(f"GET request for {self.path}")
        # Call parent method to serve files
        return super().do_GET()

# Set up the server
with socketserver.TCPServer(("", PORT), MyHandler) as httpd:
    print(f"Server running at http://localhost:{PORT}/")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
Handler = http.server.SimpleHTTPRequestHandler

# Create the server
with socketserver.TCPServer(('', PORT), Handler) as httpd:
    print(f"Server running at http://localhost:{PORT}/")
    print(f"Serving files from {current_dir}")
    # Start serving
    httpd.serve_forever()
