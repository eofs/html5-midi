requirejs.config({
    baseUrl: 'js/libs'
});

require(['jquery', "midi"], function($, midi) {
    if (!window.File || !window.FileReader || !window.FileList || !window.Blob) {
        alert("Required File APIs are not fully supported")
    }

    String.prototype.format = function() {
      var args = arguments;
      return this.replace(/{(\d+)}/g, function(match, number) {
        return typeof args[number] != 'undefined'
          ? args[number]
          : match
        ;
      });
    };

    var startTime = new Date().getTime();
    function output(input) {
        var time = new Date().getTime() - startTime;
        $('#output').append('[{0}] {1}'.format(time, input) + "\n");
    }

    function updateProgress(e) {
        if (e.lengthComputable) {
            var percent = Math.round((e.loaded / e.total) * 100);
            if (percent < 100) {
                output('Loading, {0}% completed'.format(percent));
            }
        }
    }

    $("#file").on('change', function(e) {
        // Reset "console"
        $('#output').text('');
        var files = e.target.files; // FileList object
        for (var i = 0, f; f = files[i]; i++) {
            if (!f.type.match('audio/midi')) {
                output('Incorrect file format: {0}'.format(f.name));
                output("Only MIDI files are supported.");
                continue;
            }

            var reader = new FileReader();

            reader.onprogress = updateProgress;
            reader.onloadend = (function(input) {
                if (input.target.readyState == FileReader.DONE) {
                    output("File loaded");
                    output("Reading file...");
                    var data = input.target.result;
                    var readStart = new Date().getTime();
                    try {
                        var midifile = midi.load(data);
                        var readEnd = new Date().getTime();
                        output('File read completed. Took {0}ms.'.format(readEnd - readStart));
                    } catch(err) {
                        output(err);
                        return;
                    }
                    output('Header:'
                        + '\n Format: ' + midifile.header.format
                        + '\n Resolution: ' + midifile.resolution()
                        + '\n Tracks: ' + midifile.header.trackCount);
                    output('Content:\n' + midifile);

                } else {
                    output("Could not load the file");
                }
            });

            // Start reading the file
            //reader.readAsArrayBuffer(f);
            reader.readAsBinaryString(f);
            //reader.readAsText(f);
        }

    });
});
