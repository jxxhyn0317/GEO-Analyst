import http.server
import os

os.chdir("/Users/jaekim/Desktop/GEO Readiness")
handler = http.server.SimpleHTTPRequestHandler
httpd = http.server.HTTPServer(("", 3847), handler)
print("Serving on port 3847")
httpd.serve_forever()
