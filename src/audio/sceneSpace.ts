import { getImpulse, type TrackChain } from './fx';
export function makeSceneSpace(ctx:BaseAudioContext,dest:AudioNode,sizeSec:number,level:number,seed?:number) {
 const input=ctx.createGain(),reverb=ctx.createConvolver(),gain=ctx.createGain();reverb.buffer=getImpulse(ctx,sizeSec,seed);gain.gain.value=level;
 input.connect(reverb);reverb.connect(gain);gain.connect(dest);
 return {input,update(size:number,value:number){const ir=getImpulse(ctx,size,seed);if(ir!==reverb.buffer)reverb.buffer=ir;gain.gain.setTargetAtTime(value,ctx.currentTime,.03);},dispose(){input.disconnect();reverb.disconnect();gain.disconnect();}};
}
export function sendToSpace(chain:TrackChain,input:AudioNode,amount:number) {
 if(!chain.spaceSend){chain.spaceSend=input.context.createGain();chain.sceneGain.connect(chain.spaceSend);chain.spaceSend.connect(input);}
 chain.spaceSend.gain.setTargetAtTime(amount,input.context.currentTime,.02);
}
