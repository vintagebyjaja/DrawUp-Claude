# Run from SketchUp Desktop's Ruby Console: load '/full/path/Create_SketchUp_File.rb'
# Creates a native SKP with SketchUp itself. No native SKP is pre-generated in this ZIP.
require 'sketchup.rb'
require 'fileutils'
module MonroeMaterialModels
  def self.convert
    model = Sketchup.active_model
    unless model.entities.empty? && !model.modified?
      UI.messagebox('Start with a saved, empty SketchUp document before converting. Existing model contents will not be cleared by this script.')
      return
    end
    root = File.dirname(__FILE__)
    choice = UI.inputbox(['Layout'], ['Original'], ['Original|Proposed'], 'Create Monroe SketchUp model')
    return unless choice
    base = choice[0] == 'Original' ? 'Monroe_Original_Road_Layout' : 'Monroe_New_Road_Layout'
    folder = choice[0] == 'Original' ? '01_Original_Road_Layout' : '02_New_Road_Layout'
    source = File.join(root, folder, base + '.dae')
    unless File.file?(source)
      UI.messagebox('Extract the entire ZIP, including both model folders and Shared_Textures, before running this script.')
      return
    end
    imported = model.import(source, { :show_summary => false, :merge_coplanar_faces => true })
    unless imported && !model.entities.empty?
      UI.messagebox('SketchUp did not complete the Collada import. No SKP was saved. You can also use File > Import > COLLADA.')
      return
    end
    # Hide only coplanar triangulation edges, leaving object and material boundaries.
    seen = {}
    visit = lambda do |entities|
      entities.grep(Sketchup::Edge).each do |edge|
        faces = edge.faces
        if faces.length == 2 && faces[0].material == faces[1].material && faces[0].normal.samedirection?(faces[1].normal)
          edge.soft = true
          edge.smooth = true
          edge.hidden = true
        end
      end
      entities.each do |entity|
        if entity.is_a?(Sketchup::Group)
          visit.call(entity.entities)
        elsif entity.is_a?(Sketchup::ComponentInstance)
          definition = entity.definition
          next if seen[definition.object_id]
          seen[definition.object_id] = true
          visit.call(definition.entities)
        end
      end
    end
    visit.call(model.entities)
    model.rendering_options['DisplayEdges'] = false
    model.active_view.zoom_extents
    output_dir = File.join(root, 'Converted_SKP')
    FileUtils.mkdir_p(output_dir)
    output = File.join(output_dir, base + '.skp')
    output = File.join(output_dir, base + '_' + Time.now.strftime('%Y%m%d_%H%M%S') + '.skp') if File.exist?(output)
    if model.save(output)
      UI.messagebox("Native SketchUp file saved:\n#{output}\n\nUse a new empty document to convert the other version. Check group selection, textures and scale before continuing.")
    else
      UI.messagebox('SketchUp imported the scene, but could not save the output. Use File > Save As to save it manually.')
    end
  rescue StandardError => error
    UI.messagebox("Conversion stopped: #{error.message}\nThe model has not been cleared. Use File > Import and Save As if needed.")
  end
end
MonroeMaterialModels.convert
