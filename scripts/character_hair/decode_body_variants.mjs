import fs from 'node:fs';
import path from 'node:path';
import { MeshoptDecoder } from '../../node_modules/three/examples/jsm/libs/meshopt_decoder.module.js';
await MeshoptDecoder.ready;
const args=process.argv.slice(2);
if(args.length && (args.length!==2 || args[0]!=='--source-root'))throw new Error('Expected --source-root DIR');
const sourceRoot=args.length?args[1]:'.';
const folders=['public/characters/human/models-equipped','public/characters/sam','public/characters/sam/human','public/characters/tibo','public/characters/tibo/human'];
fs.mkdirSync('output/hair-rebuild-probe/decoded',{recursive:true});
const reports=[];
for(const folder of folders)for(const filename of fs.readdirSync(path.join(sourceRoot,folder))){
 if(!/\.(web|web-1k|ktx2(?:-256)?(?:-compact)?)\.glb$/.test(filename))continue;
 const source=path.join(folder,filename),bytes=fs.readFileSync(path.join(sourceRoot,source)),end=20+bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,end)),bin=bytes.subarray(end+8),parts=[];let offset=0;
 for(const view of json.bufferViews){const c=view.extensions?.EXT_meshopt_compression;let data;
 if(c){data=Buffer.alloc(view.byteLength);MeshoptDecoder.decodeGltfBuffer(data,c.count,c.byteStride,bin.subarray(c.byteOffset,c.byteOffset+c.byteLength),c.mode,c.filter);delete view.extensions.EXT_meshopt_compression;if(Object.keys(view.extensions).length===0)delete view.extensions;}
 else data=bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
 const pad=Buffer.alloc(-data.length&3);view.buffer=0;view.byteOffset=offset;parts.push(data,pad);offset+=data.length+pad.length;
 }
 json.buffers=[{byteLength:offset}];for(const key of ['extensionsUsed','extensionsRequired'])if(json[key])json[key]=json[key].filter(x=>x!=='EXT_meshopt_compression');
 const j=Buffer.from(JSON.stringify(json)),jp=Buffer.alloc(-j.length&3,32),newBin=Buffer.concat(parts),head=Buffer.alloc(20),bh=Buffer.alloc(8);head.writeUInt32LE(0x46546c67);head.writeUInt32LE(2,4);head.writeUInt32LE(28+j.length+jp.length+newBin.length,8);head.writeUInt32LE(j.length+jp.length,12);head.writeUInt32LE(0x4e4f534a,16);bh.writeUInt32LE(newBin.length);bh.writeUInt32LE(0x004e4942,4);
 const output='output/hair-rebuild-probe/decoded/'+filename;fs.writeFileSync(output,Buffer.concat([head,j,jp,bh,newBin]));reports.push({source,decoded:output});
}
fs.writeFileSync('output/hair-rebuild-probe/decoded-variants.json',JSON.stringify(reports,null,2));console.log(`Decoded ${reports.length} variants independently.`);
