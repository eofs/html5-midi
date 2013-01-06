define(['stream'], function(Stream) {
    // Based on https://github.com/gasman/jasmid
    function readChunk(stream) {
        var id = stream.read(4);
        var length = stream.readInt32();
        return {
            'id': id,
            'length': length,
            'data': stream.read(length)
        }
    }

    var lastType;

    function readEvent(stream) {
        var event = {};
        event.delta = stream.readVarInt();
        var type = stream.readInt8();

        if ((type & 0xf0) == 0xf0) {
            // System/meta event
            if (type == 0xff) {
                event.type = 'meta';
                var subType = stream.readInt8();
                var length = stream.readVarInt();
                switch (subType) {
                    case 0x00:
                        event.subtype = 'sequenceNumber';
                        event.number = stream.readInt16()
                        return event;
                    case 0x01:
                        event.subtype = 'text';
                        event.text = stream.read(length);
                        return event;
                    case 0x02:
                        event.subtype = 'copyrightNotice';
                        event.text = stream.read(length);
                        return event;
                    case 0x03:
                        event.subtype = 'trackName';
                        event.text = stream.read(length);
                        return event;
                    case 0x04:
                        event.subtype = 'instrumentName';
                        event.text = stream.read(length);
                        return event;
                    case 0x05:
                        event.subtype = 'lyrics';
                        event.text = stream.read(length);
                        return event;
                    case 0x06:
                        event.subtype = 'marker';
                        event.text= stream.read(length);
                        return event;
                    case 0x07:
                        event.subtype = 'cuePoint';
                        event.text = stream.read(length);
                        return event;
                    case 0x20:
                        event.subtype = 'midiChannelPrefix';
                        if (length != 1) throw 'Expected length for midiChannelPrefix is 1, got ' + length;
                        event.channel = stream.readInt8();
                        return event;
                    case 0x2f:
                        event.subtype = 'endOfTrack';
                        if (length != 0) throw 'Expected length for endOfTrack is 0, got ' + length;
                        return event;
                    case 0x51:
                        event.subtype = 'setTempo';
                        if (length != 3) throw 'Expected length for setTempo is 3, got ' + length;
                        event.microsecondsPerBeat = (
                            (stream.readInt8() << 16)
                            + (stream.readInt8() << 8)
                            + stream.readInt8()
                        );
                        return event;
                    case 0x54:
                        event.subtype = 'smpteOffset';
                        if (length != 5) throw 'Expected length for smpteOffset is 5, got ' + length;
                        var hour = stream.readInt8();
                        event.framerate = {
                            0x00: 24, 0x20: 25, 0x40: 29, 0x60: 30
                        }[hour & 0x60];
                        event.hour = hour & 0x1f;
                        event.min = stream.readInt8();
                        event.sec = stream.readInt8();
                        event.frame = stream.readInt8();
                        event.subframe = stream.readInt8();
                        return event;
                    case 0x58:
                        event.subtype = 'timeSignature';
                        if (length != 4) throw 'Expected length for timeSignature is 4, got ' + length;
                        event.numerator = stream.readInt8();
                        event.denominator = Math.pow(2, stream.readInt8());
                        event.metronome = stream.readInt8();
                        event.thirtyseconds = stream.readInt8();
                        return event;
                    case 0x59:
                        event.subtype = 'keySignature';
                        if (length != 2) throw 'Expected length for keySignature is 2, got ' + length;
                        event.key = stream.readInt8(true);
                        event.scale = stream.readInt8();
                        return event;
                    case 0x7f:
                        event.subtype = 'sequencerSpecific';
                        event.data = stream.read(length);
                        return event;
                    default:
                        event.subtype = 'unknown';
                        event.data = stream.read(length);
                        return event;
                }
                event.data = stream.read(length);
                return event;
            } else if (type == 0xf0) {
                event.type= 'sysEx';
                var length = stream.readVarInt();
                event.data = stream.read(length);
                return event;
            } else if (type == 0xf7) {
                event.type = 'dividedSysEx';
                var length = stream.readVarInt();
                event.data = stream.read(length);
                return event;
            } else {
                throw 'Unknown MIDI event ' + type;
            }
        } else {
            // Channel event
            var param1;
            if ((type & 0x80) == 0) {
                // Running status
                param1 = type;
                type = lastType;
            } else {
                param1 = stream.readInt8();
                lastType = type;
            }

            var eventType = type >> 4;
            event.channel = type & 0x0f;
            event.type = 'channel';
            switch (eventType) {
                case 0x08:
                    event.subtype = 'noteOff';
                    event.note = param1;
                    event.velocity = stream.readInt8();
                    return event;
                case 0x09:
                    event.note = param1;
                    event.velocity = stream.readInt8();
                    if (event.velocity == 0) {
                        event.subtype = 'noteOff';
                    } else {
                        event.subtype = 'noteOn';
                    }
                    return event;
                case 0x01:
                    event.subtype = 'noteAftertouch';
                    event.note = param1;
                    event.value = stream.readInt8();
                    return event;
                case 0x0b:
                    event.subtype = 'controller';
                    event.controller = param1;
                    event.value = stream.readInt8();
                    return event;
                case 0x0c:
                    event.subtype = 'programChange';
                    event.value = param1;
                    return event;
                case 0x0d:
                    event.subtype = 'channelAftertouch';
                    event.value = param1;
                    return event;
                case 0x0e:
                    event.subtype = 'pitchBend';
                    event.value = param1 + (stream.readInt8() << 7);
                    return event;
                default:
                    throw 'Unknown MIDI event ' + eventType;
            }
        }

        return event;
    }

    return {
        load: function(data) {
            var stream = new Stream(data);
            var header = readChunk(stream);

            if (header.id != 'MThd' || header.length != 6) {
                throw 'Invalid or corrupted MIDI file.'
            }

            // Read header data
            var headerStream = Stream(header.data);
            var format = headerStream.readInt16();
            var trackCount = headerStream.readInt16();
            var timeDivision = headerStream.readInt16();

            var header = {
                'format': format,
                'trackCount': trackCount,
                'timeDivision': timeDivision
            }

            if (format == 0 && trackCount > 1) {
                throw 'MIDI format 0 may contain only 1 track. Multiple tracks detected.'
            }

            var tracks = [];

            for (var i = 0; i < trackCount; i++) {
                tracks[i] = [];
                var track = readChunk(stream);
                if (track.id != 'MTrk') {
                    throw 'Invalid or corrupted track header.'
                }
                var trackStream = new Stream(track.data);
                while (!trackStream.eof()) {
                    var event = readEvent(trackStream);
                    tracks[i].push(event);
                }
            }

            return {
                'header': header,
                'tracks': tracks,
                'divisionType': function() {
                    if (this.header.timeDivision & 0x8000 == 0) {
                        return 0; // Metrical
                    } else {
                        return 1; // Timecode
                    }
                },
                'resolution': function() {
                    if (this.divisionType() == 1) {
                        // Ticks per beat
                        return this.header.timeDivision & 0x7FFF;
                    } else {
                        // FPS * Ticks per frame
                        return (this.header.timeDivision & 0x7F00) * (this.header.timeDivision & 0x00FF);
                    }
                },
                'toString': function() {
                    var output = '';
                    for (var t in this.tracks) {
                        output += 'Track '+ t + '\n';
                        for (var e in this.tracks[t]) {
                            var event = this.tracks[t][e]
                            output += '(' + event.delta + ') ' + event.subtype;
                            var text =
                                event.text
                                || event.value
                                || event.note
                                || event.microsecondsPerBeat
                            if (text) output += ' [' + text + ']';
                            output += '\n';
                        }
                    }
                    return output;
                }
            }
        }
    }
});
