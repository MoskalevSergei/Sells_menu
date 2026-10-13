"""Small standard-library DOM bridge for Node tests; browser uses its native DOMParser."""
import sys,json
from xml.etree import ElementTree as ET
def convert(e):
    return {"name":e.tag.rsplit('}',1)[-1],"attrs":dict(e.attrib),"text":''.join(e.itertext()),"children":[convert(c) for c in e]}
print(json.dumps(convert(ET.fromstring(sys.stdin.buffer.read())),ensure_ascii=False,separators=(',',':')))
